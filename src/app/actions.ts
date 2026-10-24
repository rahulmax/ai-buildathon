'use server'

import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { fyCode, isGstin, totals } from '@/lib/gst'
import { postEntry } from '@/lib/ledger'
import { BillForm, DetailsForm, InvoiceForm } from '@/lib/schemas'
import { COOKIE, requireWorkspace } from '@/lib/workspace'
import { todayIST } from '@/lib/dates'

export type ActionState = { error?: string } | undefined

export async function saveDetails(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = DetailsForm.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const d = parsed.data
  if (d.gstin && !isGstin(d.gstin)) return { error: 'That GSTIN doesn’t look right. Leave it empty if you don’t have one.' }
  const sql = await db()
  const [ws] = await sql`
    insert into workspace (name, state, gstin, upi_id)
    values (${d.name}, ${d.state}, ${d.gstin || null}, ${d.upi_id})
    returning id`
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

// Save the invoice and post its ledger entry in one transaction.
export async function createInvoice(input: InvoiceForm) {
  const ws = await requireWorkspace()
  const f = InvoiceForm.parse(input)
  const t = totals(
    f.lines.map((l) => ({ description: l.description, quantity: l.quantity, rate: l.rate, gstRate: l.gst_rate })),
    ws.state,
    f.customer_state,
  )
  const sql = await db()

  const result = await sql.begin(async (tx) => {
    let [customer] = await tx`
      select id from customer
      where workspace_id = ${ws.id} and lower(name) = lower(${f.customer_name}) limit 1`
    if (!customer) {
      ;[customer] = await tx`
        insert into customer (workspace_id, name, state, phone)
        values (${ws.id}, ${f.customer_name}, ${f.customer_state}, ${f.customer_phone || null})
        returning id`
    } else if (f.customer_phone) {
      await tx`update customer set phone = ${f.customer_phone} where id = ${customer.id}`
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
      values (${ws.id}, ${customer.id}, ${number}, ${f.issue_date}, ${f.due_date || null}, ${f.customer_state},
        ${t.subtotal}, ${t.cgst}, ${t.sgst}, ${t.igst}, ${t.total}, ${slug()}, ${f.language ?? null}, ${f.transcript ?? null})
      returning id, public_slug`

    for (const l of t.lines) {
      await tx`
        insert into invoice_line (invoice_id, description, quantity, rate, amount, gst_rate)
        values (${inv.id}, ${l.description}, ${l.quantity}, ${l.rate}, ${l.amount}, ${l.gstRate})`
    }

    await postEntry(tx, {
      workspaceId: ws.id,
      date: f.issue_date,
      memo: `Invoice ${number} to ${f.customer_name}`,
      sourceType: 'invoice',
      sourceId: inv.id,
      lines: [
        { account: 'receivable', debit: t.total, customerId: customer.id },
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
