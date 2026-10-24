import 'server-only'
import { db } from './db'

// Who owes me reads the receivable balance per customer from the ledger,
// not from invoice status. That's what makes it books and not a list.
export async function whoOwesMe(workspaceId: string) {
  const sql = await db()
  const customers = await sql<{ customer_id: string; name: string; phone: string | null; balance: number }[]>`
    select c.id as customer_id, c.name, c.phone,
      (sum(l.debit) - sum(l.credit))::bigint as balance
    from ledger_line l
    join ledger_entry e on e.id = l.entry_id
    join customer c on c.id = l.customer_id
    where e.workspace_id = ${workspaceId} and l.account = 'receivable'
    group by c.id
    having sum(l.debit) - sum(l.credit) <> 0
    order by balance desc`
  const invoices = await sql<{
    id: string; number: string; customer_id: string; customer_name: string; issue_date: string
    due_date: string | null; total: number; public_slug: string; language: string | null
  }[]>`
    select i.id, i.number, i.customer_id, c.name as customer_name, i.issue_date, i.due_date,
      i.total, i.public_slug, i.language
    from invoice i join customer c on c.id = i.customer_id
    where i.workspace_id = ${workspaceId} and i.status = 'open'
    order by coalesce(i.due_date, i.issue_date), i.created_at`
  const total = customers.reduce((s, c) => s + c.balance, 0)
  return { total, customers, invoices }
}

// GST collected on invoices, minus GST paid on bills, for one month.
export async function gstForMonth(workspaceId: string, month: string) {
  const sql = await db()
  const rows = await sql<{ account: string; balance: number }[]>`
    select l.account, (sum(l.credit) - sum(l.debit))::bigint as balance
    from ledger_line l join ledger_entry e on e.id = l.entry_id
    where e.workspace_id = ${workspaceId}
      and to_char(e.date, 'YYYY-MM') = ${month}
      and l.account like '%gst_%'
    group by l.account`
  const get = (a: string) => rows.find((r) => r.account === a)?.balance ?? 0
  const heads = (['cgst', 'sgst', 'igst'] as const).map((h) => {
    const collected = get(`${h}_payable`)
    const paid = -get(`${h}_input`)
    return { head: h, collected, paid, net: collected - paid }
  })
  const collected = heads.reduce((s, h) => s + h.collected, 0)
  const paid = heads.reduce((s, h) => s + h.paid, 0)
  return { heads, collected, paid, net: collected - paid }
}

export async function recentActivity(workspaceId: string) {
  const sql = await db()
  return sql<{ id: string; kind: 'invoice' | 'bill'; title: string; amount: number; date: string; status: string | null; slug: string | null }[]>`
    (select i.id, 'invoice' as kind, c.name as title, i.total as amount, i.issue_date as date,
       i.status, i.public_slug as slug, i.created_at
     from invoice i join customer c on c.id = i.customer_id where i.workspace_id = ${workspaceId})
    union all
    (select b.id, 'bill', b.seller_name, b.total, b.bill_date, null, null, b.created_at
     from bill b where b.workspace_id = ${workspaceId})
    order by created_at desc limit 8`
}

export async function statsToday() {
  const sql = await db()
  const [s] = await sql<{ users: number; invoices: number; bills: number; invoiced: number; chases: number }[]>`
    select
      (select count(*)::int from workspace where (created_at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date) as users,
      (select count(*)::int from invoice where (created_at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date) as invoices,
      (select count(*)::int from bill where (created_at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date) as bills,
      (select coalesce(sum(total), 0)::bigint from invoice where (created_at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date) as invoiced,
      (select count(*)::int from chase where (created_at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date) as chases`
  return s
}
