import 'server-only'
import { randomBytes } from 'node:crypto'
import { db } from './db'
import { phoneKey, type CustomerOption } from './customers'
import { canChargeGst, fyCode, totals } from './gst'
import { checkGstin } from './gstin'
import { postEntry } from './ledger'
import { InvoiceForm } from './schemas'
import type { Workspace } from './workspace'

const slug = () => randomBytes(6).toString('base64url')

export type InvoiceRow = {
  id: string; number: string; customer_name: string; issue_date: string; total: number
  status: 'open' | 'paid' | 'cancelled'; public_slug: string; has_payment: boolean
}

// Every invoice, newest first. q filters by customer name.
export async function listInvoices(workspaceId: string, q = '') {
  const sql = await db()
  const like = `%${q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`
  return sql<InvoiceRow[]>`
    select i.id, i.number, c.name as customer_name, i.issue_date, i.total, i.status, i.public_slug,
      exists (select 1 from payment p where p.invoice_id = i.id) as has_payment
    from invoice i join customer c on c.id = i.customer_id
    where i.workspace_id = ${workspaceId} and c.name ilike ${like}
    order by i.issue_date desc, i.created_at desc`
}

export async function workspaceCustomers(workspaceId: string) {
  const sql = await db()
  return sql<CustomerOption[]>`
    select id, name, state, phone, gstin from customer
    where workspace_id = ${workspaceId} order by name`
}

export type SavedInvoice = { id: string; slug: string; number: string; total: number; gst: number }

// Save the invoice and post its ledger entry in one transaction. Used by the confirm
// form and the WhatsApp webhook, so it takes the workspace instead of reading the cookie.
export async function saveInvoice(
  ws: Workspace,
  input: InvoiceForm,
): Promise<SavedInvoice | { error: string }> {
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
      returning id, public_slug, number`

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

  return {
    id: result.id as string,
    slug: result.public_slug as string,
    number: result.number as string,
    total: t.total,
    gst: t.cgst + t.sgst + t.igst,
  }
}
