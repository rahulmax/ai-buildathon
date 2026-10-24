import 'server-only'
import { db } from './db'
import type { CustomerOption } from './customers'

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
