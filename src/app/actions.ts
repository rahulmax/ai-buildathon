'use server'

import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { canChargeGst, fyCode, isGstin, totals } from '@/lib/gst'
import { checkGstin } from '@/lib/gstin'
import { postEntry, type Account } from '@/lib/ledger'
import { phoneKey, type CustomerOption } from '@/lib/customers'
import { workspaceCustomers } from '@/lib/invoices'
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

const slug = () => randomBytes(6).toString('base64url')

export type InvoiceFormData = { registered: boolean; customers: CustomerOption[] }

// What the confirm form needs: can this workspace charge GST, and who its customers are.
export async function loadInvoiceForm(): Promise<InvoiceFormData> {
  const ws = await requireWorkspace()
  return { registered: canChargeGst(ws.gstin), customers: await workspaceCustomers(ws.id) }
}

// Save the invoice and post its ledger entry in one transaction.
export async function createInvoice(input: InvoiceForm): Promise<{ slug: string } | { error: string }> {
  const ws = await requireWorkspace()
  const f = InvoiceForm.parse(input)
  let gstin: string | null = null
  let placeOfSupply = f.customer_state
  if (f.customer_gstin) {
    const check = checkGstin(f.customer_gstin)
    if (!check.ok) return { error: `Customer GSTIN: ${check.error}` }
    gstin = check.gstin
    // A registered customer's place of supply is the state on their GSTIN.
    placeOfSupply = check.state
  }
  // Never trust the form on GST: without a GSTIN the seller can't charge any.
  const registered = canChargeGst(ws.gstin)
  const t = totals(
    f.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      rate: l.rate,
      gstRate: registered ? l.gst_rate : 0,
    })),
    ws.state,
    placeOfSupply,
  )
  const phone = f.customer_phone || null
  const phoneDigits = phone ? phoneKey(phone) : ''
  const sql = await db()

  if (f.customer_id) {
    const [own] = await sql`select 1 from customer where id = ${f.customer_id} and workspace_id = ${ws.id}`
    if (!own) return { error: 'Couldn’t find that customer. Pick again.' }
  }

  const result = await sql.begin(async (tx) => {
    // Same customer: the owner said so, or the GSTIN, phone or exact name matches.
    // A different GSTIN on file means a different business, whatever the name.
    let customerId: string | null = f.customer_id ?? null
    if (!customerId && gstin) {
      const [c] = await tx`
        select id from customer where workspace_id = ${ws.id} and gstin = ${gstin}
        order by created_at limit 1`
      customerId = c?.id ?? null
    }
    if (!customerId && phoneDigits.length === 10) {
      const [c] = await tx`
        select id from customer
        where workspace_id = ${ws.id}
          and right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 10) = ${phoneDigits}
          and (gstin is null or ${gstin}::text is null or gstin = ${gstin})
        order by created_at limit 1`
      customerId = c?.id ?? null
    }
    if (!customerId) {
      const [c] = await tx`
        select id from customer
        where workspace_id = ${ws.id} and lower(name) = lower(${f.customer_name})
          and (gstin is null or ${gstin}::text is null or gstin = ${gstin})
        order by created_at limit 1`
      customerId = c?.id ?? null
    }
    if (customerId) {
      await tx`
        update customer set
          phone = coalesce(${phone}::text, phone),
          gstin = coalesce(${gstin}::text, gstin),
          state = coalesce(${gstin ? placeOfSupply : null}::text, state)
        where id = ${customerId}`
    } else {
      const [c] = await tx`
        insert into customer (workspace_id, name, state, phone, gstin)
        values (${ws.id}, ${f.customer_name}, ${placeOfSupply}, ${phone}, ${gstin})
        returning id`
      customerId = c.id as string
    }

    // Numbers run in sequence per workspace per financial year. Lock to keep them unique.
    await tx`select pg_advisory_xact_lock(hashtext(${ws.id}))`
    const fy = fyCode(new Date(`${f.issue_date}T00:00:00Z`))
    const [{ n }] = await tx`
      select count(*)::int + 1 as n from invoice
      where workspace_id = ${ws.id} and number like ${`INV-${fy}-%`}`
    const number = `INV-${fy}-${String(n).padStart(4, '0')}`

    const [inv] = await tx`
      insert into invoice (workspace_id, customer_id, number, issue_date, due_date, place_of_supply,
        subtotal, cgst, sgst, igst, total, public_slug, language, transcript)
      values (${ws.id}, ${customerId}, ${number}, ${f.issue_date}, ${f.due_date || null}, ${placeOfSupply},
        ${t.subtotal}, ${t.cgst}, ${t.sgst}, ${t.igst}, ${t.total}, ${slug()}, ${f.language ?? null}, ${f.transcript ?? null})
      returning id, public_slug`

    for (const [i, l] of t.lines.entries()) {
      await tx`
        insert into invoice_line (invoice_id, description, sac_hsn, quantity, rate, amount, gst_rate)
        values (${inv.id}, ${l.description}, ${f.lines[i].sac_hsn ?? null}, ${l.quantity}, ${l.rate}, ${l.amount}, ${l.gstRate})`
    }

    await postEntry(tx, {
      workspaceId: ws.id,
      date: f.issue_date,
      memo: `Invoice ${number} to ${f.customer_name}`,
      sourceType: 'invoice',
      sourceId: inv.id,
      lines: [
        { account: 'receivable', debit: t.total, customerId },
        { account: 'revenue', credit: t.subtotal },
        { account: 'cgst_payable', credit: t.cgst },
        { account: 'sgst_payable', credit: t.sgst },
        { account: 'igst_payable', credit: t.igst },
      ],
    })
    return inv
  })

  revalidatePath('/', 'layout')
  return { slug: result.public_slug as string }
}

// Cancel, credit-note style: the invoice stays, marked cancelled, and a reversing
// entry takes it back out of receivable, revenue and GST. Only before any payment.
export async function cancelInvoice(invoiceId: string): Promise<{ error?: string }> {
  const ws = await requireWorkspace()
  const sql = await db()
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
  revalidatePath('/', 'layout')
  return {}
}

export async function markPaid(invoiceId: string) {
  const ws = await requireWorkspace()
  const sql = await db()
  await sql.begin(async (tx) => {
    const [inv] = await tx`
      select id, number, customer_id, total, status from invoice
      where id = ${invoiceId} and workspace_id = ${ws.id} for update`
    if (!inv || inv.status === 'paid') return
    const [pay] = await tx`
      insert into payment (invoice_id, amount, method) values (${inv.id}, ${inv.total}, 'manual')
      returning id`
    await tx`update invoice set status = 'paid' where id = ${inv.id}`
    await postEntry(tx, {
      workspaceId: ws.id,
      date: todayIST(),
      memo: `Payment for ${inv.number}`,
      sourceType: 'payment',
      sourceId: pay.id,
      lines: [
        { account: 'bank', debit: inv.total },
        { account: 'receivable', credit: inv.total, customerId: inv.customer_id },
      ],
    })
  })
  revalidatePath('/', 'layout')
}

// A bill is treated as already paid. No seller GSTIN, no input credit:
// the whole total goes to expenses.
export async function createBill(input: BillForm) {
  const ws = await requireWorkspace()
  const f = BillForm.parse(input)
  const claimable = Boolean(f.seller_gstin && isGstin(f.seller_gstin))
  const gst = f.cgst + f.sgst + f.igst
  const subtotal = f.total - gst
  const sql = await db()

  await sql.begin(async (tx) => {
    const [bill] = await tx`
      insert into bill (workspace_id, seller_name, seller_gstin, bill_date, category,
        subtotal, cgst, sgst, igst, total)
      values (${ws.id}, ${f.seller_name}, ${f.seller_gstin || null}, ${f.bill_date}, ${f.category},
        ${subtotal}, ${f.cgst}, ${f.sgst}, ${f.igst}, ${f.total})
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
            { account: 'bank', credit: f.total },
          ]
        : [
            { account: 'expenses', debit: f.total },
            { account: 'bank', credit: f.total },
          ],
    })
  })
  revalidatePath('/', 'layout')
}
