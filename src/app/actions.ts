'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { claimsGst, findDuplicateBill } from '@/lib/bills'
import { db } from '@/lib/db'
import { canChargeGst } from '@/lib/gst'
import { checkGstin } from '@/lib/gstin'
import { postEntry, type Account } from '@/lib/ledger'
import type { CustomerOption } from '@/lib/customers'
import { saveInvoice, workspaceCustomers } from '@/lib/invoices'
import { cancelPayLink, settleAll, syncPayLink } from '@/lib/pinelabs'
import { BillForm, DetailsForm, InvoiceForm } from '@/lib/schemas'
import { COOKIE, requireWorkspace } from '@/lib/workspace'
import { todayIST } from '@/lib/dates'

export type ActionState = { error?: string } | undefined

export async function saveDetails(_: ActionState, form: FormData): Promise<ActionState> {
  let services: unknown = []
  try {
    services = JSON.parse(String(form.get('services') ?? '[]'))
  } catch {}
  const parsed = DetailsForm.safeParse({ ...Object.fromEntries(form), services })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const d = parsed.data
  let gstin: string | null = null
  if (d.gstin) {
    const check = checkGstin(d.gstin, d.state)
    if (!check.ok) return { error: check.error }
    gstin = check.gstin
  }
  const sql = await db()
  const ws = await sql.begin(async (tx) => {
    const [ws] = await tx`
      insert into workspace (name, state, gstin, upi_id)
      values (${d.name}, ${d.state}, ${gstin}, ${d.upi_id})
      returning id`
    for (const s of d.services) {
      await tx`
        insert into workspace_service (workspace_id, name, kind, code, code_description)
        values (${ws.id}, ${s.name}, ${s.kind}, ${s.code}, ${s.code_description})`
    }
    return ws
  })
  ;(await cookies()).set(COOKIE, ws.id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  })
  redirect('/')
}

export type InvoiceFormData = { registered: boolean; customers: CustomerOption[] }

// What the confirm form needs: can this workspace charge GST, and who its customers are.
export async function loadInvoiceForm(): Promise<InvoiceFormData> {
  const ws = await requireWorkspace()
  return { registered: canChargeGst(ws.gstin), customers: await workspaceCustomers(ws.id) }
}

// Save the invoice and post its ledger entry in one transaction.
export async function createInvoice(input: InvoiceForm): Promise<{ slug: string } | { error: string }> {
  const ws = await requireWorkspace()
  const res = await saveInvoice(ws, input)
  if ('error' in res) return res
  revalidatePath('/', 'layout')
  return { slug: res.slug }
}

// Cancel, credit-note style: the invoice stays, marked cancelled, and a reversing
// entry takes it back out of receivable, revenue and GST. Only before any payment.
export async function cancelInvoice(invoiceId: string): Promise<{ error?: string }> {
  const ws = await requireWorkspace()
  const sql = await db()
  // A Pine Labs payment the webhook missed would land first, and block the cancel below.
  const [current] = await sql<{ id: string; status: string; pay_link: string | null }[]>`
    select id, status, pay_link from invoice where id = ${invoiceId} and workspace_id = ${ws.id}`
  if (current) await syncPayLink(current)
  const error = await sql.begin(async (tx) => {
    const [inv] = await tx`
      select id, number, status from invoice
      where id = ${invoiceId} and workspace_id = ${ws.id} for update`
    if (!inv) return 'Couldn’t find that invoice.'
    if (inv.status === 'cancelled') return null
    if (inv.status !== 'open') return 'This invoice is paid, so it can’t be cancelled.'
    const [{ paid }] = await tx`select exists (select 1 from payment where invoice_id = ${inv.id}) as paid`
    if (paid) return 'A payment came in on this invoice, so it can’t be cancelled.'

    // Reverse exactly what was posted, not a recomputation.
    const lines = await tx<{ account: Account; debit: number; credit: number; customer_id: string | null }[]>`
      select l.account, l.debit, l.credit, l.customer_id
      from ledger_line l join ledger_entry e on e.id = l.entry_id
      where e.workspace_id = ${ws.id} and e.source_type = 'invoice' and e.source_id = ${inv.id}`
    await tx`update invoice set status = 'cancelled', cancelled_at = now() where id = ${inv.id}`
    await postEntry(tx, {
      workspaceId: ws.id,
      date: todayIST(),
      memo: `Cancelled invoice ${inv.number}`,
      sourceType: 'reversal',
      sourceId: inv.id,
      lines: lines.map((l) => ({ account: l.account, debit: l.credit, credit: l.debit, customerId: l.customer_id })),
    })
    return null
  })
  if (error) return { error }
  // The Pine Labs link stops working too, so nobody pays a cancelled invoice.
  await cancelPayLink(invoiceId)
  revalidatePath('/', 'layout')
  return {}
}

// TDS under 194J: 10% of the fee before GST (OQ-BKS-6).
const tdsOn = (subtotal: number) => Math.round(subtotal * 0.1)

// What each "Mark as paid" choice means in rupees, for the buttons.
export async function paymentChoices(invoiceId: string) {
  const ws = await requireWorkspace()
  const sql = await db()
  const [inv] = await sql<{ subtotal: number; total: number; status: string }[]>`
    select subtotal, total, status from invoice where id = ${invoiceId} and workspace_id = ${ws.id}`
  if (!inv || inv.status !== 'open') return null
  const tds = tdsOn(inv.subtotal)
  return { total: inv.total, tds, lessTds: inv.total - tds }
}

// Cash or a direct transfer. Paid less TDS: the client keeps 10% of the fee
// and pays it to the government for us, so it's ours to claim back.
// Paid and cancelled invoices are left alone.
export async function markPaid(invoiceId: string, opts: { lessTds?: boolean } = {}) {
  const ws = await requireWorkspace()
  const sql = await db()
  await sql.begin(async (tx) => {
    const [inv] = await tx`
      select id, number, customer_id, subtotal, total, status from invoice
      where id = ${invoiceId} and workspace_id = ${ws.id} for update`
    if (!inv || inv.status !== 'open') return
    const tds = opts.lessTds ? tdsOn(inv.subtotal) : 0
    const cash = inv.total - tds
    const [pay] = await tx`
      insert into payment (invoice_id, amount, tds, method) values (${inv.id}, ${cash}, ${tds}, 'manual')
      returning id`
    await tx`update invoice set status = 'paid' where id = ${inv.id}`
    await postEntry(tx, {
      workspaceId: ws.id,
      date: todayIST(),
      memo: tds ? `Payment for ${inv.number}, less TDS` : `Payment for ${inv.number}`,
      sourceType: 'payment',
      sourceId: pay.id,
      lines: [
        { account: 'bank', debit: cash },
        { account: 'tds_receivable', debit: tds },
        { account: 'receivable', credit: inv.total, customerId: inv.customer_id },
      ],
    })
  })
  revalidatePath('/', 'layout')
}

// Pine Labs paid out. The owner says what reached the bank; the rest was the fee.
export async function settlePineLabs(receivedPaise: number): Promise<ActionState> {
  const ws = await requireWorkspace()
  const result = await settleAll(ws.id, Math.round(Number(receivedPaise)))
  if (result.error) return { error: result.error }
  revalidatePath('/', 'layout')
}

// A bill is treated as already paid, from the bank or personally. Input GST
// is claimed only with a valid seller GSTIN, and never on food; otherwise the
// whole total goes to expenses. A likely repeat isn't saved unless forced.
export type CreateBillResult = { duplicate: true } | { duplicate: false; claimed: number }

export async function createBill(input: BillForm, opts: { force?: boolean } = {}): Promise<CreateBillResult> {
  const ws = await requireWorkspace()
  const f = BillForm.parse(input)
  const claimable = claimsGst(f.category, f.seller_gstin)
  const gst = f.cgst + f.sgst + f.igst
  const subtotal = f.total - gst
  const paidFrom = f.paid_from === 'personal' ? 'owner_contribution' : 'bank'
  const sql = await db()

  const result = await sql.begin(async (tx): Promise<CreateBillResult> => {
    if (!opts.force) {
      const dup = await findDuplicateBill(tx, {
        workspaceId: ws.id,
        sellerName: f.seller_name,
        billDate: f.bill_date,
        total: f.total,
      })
      if (dup) return { duplicate: true }
    }
    const [bill] = await tx`
      insert into bill (workspace_id, seller_name, seller_gstin, bill_date, category,
        subtotal, cgst, sgst, igst, total, paid_from)
      values (${ws.id}, ${f.seller_name}, ${f.seller_gstin || null}, ${f.bill_date}, ${f.category},
        ${subtotal}, ${f.cgst}, ${f.sgst}, ${f.igst}, ${f.total}, ${f.paid_from})
      returning id`
    await postEntry(tx, {
      workspaceId: ws.id,
      date: f.bill_date,
      memo: `Bill from ${f.seller_name}`,
      sourceType: 'bill',
      sourceId: bill.id,
      lines: claimable
        ? [
            { account: 'expenses', debit: subtotal },
            { account: 'cgst_input', debit: f.cgst },
            { account: 'sgst_input', debit: f.sgst },
            { account: 'igst_input', debit: f.igst },
            { account: paidFrom, credit: f.total },
          ]
        : [
            { account: 'expenses', debit: f.total },
            { account: paidFrom, credit: f.total },
          ],
    })
    return { duplicate: false, claimed: claimable ? gst : 0 }
  })
  if (!result.duplicate) revalidatePath('/', 'layout')
  return result
}
