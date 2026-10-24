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

const GST_HEADS = ['cgst', 'sgst', 'igst'] as const

// GST to pay for one month, with unused input credit carried forward.
// Walk every month from the first GST entry: net = collected less input; take
// off any credit brought in. Below zero, the month shows credit and carries it
// on; at or above zero it's to pay (assumed paid) and nothing carries.
// Reversal entries (cancelled invoices) are ordinary lines and net out here.
export async function gstForMonth(workspaceId: string, month: string) {
  const sql = await db()
  const rows = await sql<{ month: string; account: string; collected: number; input: number }[]>`
    select to_char(e.date, 'YYYY-MM') as month, l.account,
      (sum(l.credit) - sum(l.debit))::bigint as collected,
      (sum(l.debit) - sum(l.credit))::bigint as input
    from ledger_line l join ledger_entry e on e.id = l.entry_id
    where e.workspace_id = ${workspaceId}
      and to_char(e.date, 'YYYY-MM') <= ${month}
      and l.account in ('cgst_payable', 'sgst_payable', 'igst_payable', 'cgst_input', 'sgst_input', 'igst_input')
    group by 1, 2
    order by 1`

  // Months with no GST lines change nothing: a credit just passes through.
  const months = [...new Set(rows.map((r) => r.month))].filter((m) => m < month)
  const netFor = (m: string) =>
    rows
      .filter((r) => r.month === m)
      .reduce((s, r) => s + (r.account.endsWith('_payable') ? r.collected : -r.input), 0)
  let carriedIn = 0
  for (const m of months) {
    const due = netFor(m) - carriedIn
    carriedIn = due < 0 ? -due : 0
  }

  const get = (account: string) => rows.find((r) => r.month === month && r.account === account)
  const heads = GST_HEADS.map((head) => ({
    head,
    collected: get(`${head}_payable`)?.collected ?? 0,
    paid: get(`${head}_input`)?.input ?? 0,
  }))
  const collected = heads.reduce((s, h) => s + h.collected, 0)
  const paid = heads.reduce((s, h) => s + h.paid, 0)
  const due = collected - paid - carriedIn
  return {
    heads,
    collected,
    paid,
    carriedIn,
    toPay: Math.max(due, 0),
    credit: Math.max(-due, 0),
  }
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

const UUID = /^[0-9a-f-]{36}$/i

// Extra team workspaces to leave out, from env, on top of workspace.is_team.
const teamWorkspaceIds = () =>
  (process.env.TEAM_WORKSPACE_IDS ?? '')
    .split(',')
    .map((id) => id.trim().toLowerCase())
    .filter((id) => UUID.test(id))
    .join(',')

// The traction slide. Team workspaces are left out everywhere. A person counts
// once they save an invoice or a bill today (IST), not on sign-up. Cancelled
// invoices don't count towards invoices or the amount invoiced.
export async function statsToday() {
  const sql = await db()
  const [s] = await sql<{ users: number; invoices: number; bills: number; invoiced: number; chases: number }[]>`
    with today as (
      select (now() at time zone 'Asia/Kolkata')::date as d
    ), ws as (
      select id from workspace
      where not is_team and id::text <> all(string_to_array(${teamWorkspaceIds()}, ','))
    ), inv as (
      select i.workspace_id, i.status, i.total from invoice i
      where i.workspace_id in (select id from ws)
        and (i.created_at at time zone 'Asia/Kolkata')::date = (select d from today)
    ), bil as (
      select b.workspace_id from bill b
      where b.workspace_id in (select id from ws)
        and (b.created_at at time zone 'Asia/Kolkata')::date = (select d from today)
    )
    select
      (select count(*)::int from (select workspace_id from inv union select workspace_id from bil) p) as users,
      (select count(*)::int from inv where status <> 'cancelled') as invoices,
      (select count(*)::int from bil) as bills,
      (select coalesce(sum(total), 0)::bigint from inv where status <> 'cancelled') as invoiced,
      (select count(*)::int from chase ch join invoice i on i.id = ch.invoice_id
        where i.workspace_id in (select id from ws)
          and (ch.created_at at time zone 'Asia/Kolkata')::date = (select d from today)) as chases`
  return s
}

// Profit for one month, straight from the ledger: sales less expenses.
// Expenses split by the category of the bill that posted them. `received` is
// cash that actually came in: bank and Pine Labs debits on payment entries.
// TDS kept by clients isn't cash, so it stays out.
export async function profitForMonth(workspaceId: string, month: string) {
  const sql = await db()
  const [totals] = await sql<{ revenue: number; expenses: number; received: number }[]>`
    select
      coalesce(sum(l.credit - l.debit) filter (where l.account = 'revenue'), 0)::bigint as revenue,
      coalesce(sum(l.debit - l.credit) filter (where l.account = 'expenses'), 0)::bigint as expenses,
      coalesce(sum(l.debit) filter (
        where e.source_type = 'payment' and l.account in ('bank', 'pine_labs_clearing')
      ), 0)::bigint as received
    from ledger_line l join ledger_entry e on e.id = l.entry_id
    where e.workspace_id = ${workspaceId} and to_char(e.date, 'YYYY-MM') = ${month}`
  const categories = await sql<{ category: string; amount: number; bills: number }[]>`
    select b.category, sum(l.debit - l.credit)::bigint as amount, count(distinct b.id)::int as bills
    from ledger_line l
    join ledger_entry e on e.id = l.entry_id
    join bill b on b.id = e.source_id and e.source_type = 'bill'
    where e.workspace_id = ${workspaceId} and to_char(e.date, 'YYYY-MM') = ${month}
      and l.account = 'expenses'
    group by b.category
    order by amount desc`
  return { ...totals, profit: totals.revenue - totals.expenses, categories }
}

// Sales and expenses per month, for the last `months` months up to `month`.
// Months with nothing in them still come back, as zeros.
export async function monthlyTotals(workspaceId: string, month: string, months = 6) {
  const sql = await db()
  return sql<{ month: string; revenue: number; expenses: number }[]>`
    select to_char(m, 'YYYY-MM') as month,
      coalesce(sum(l.credit - l.debit) filter (where l.account = 'revenue'), 0)::bigint as revenue,
      coalesce(sum(l.debit - l.credit) filter (where l.account = 'expenses'), 0)::bigint as expenses
    from generate_series(
      ${`${month}-01`}::date - make_interval(months => ${months - 1}),
      ${`${month}-01`}::date,
      interval '1 month') m
    left join ledger_entry e on e.workspace_id = ${workspaceId} and date_trunc('month', e.date) = m
    left join ledger_line l on l.entry_id = e.id
    group by m
    order by m`
}

// Every account's balance since the start. Debits and credits total the same,
// or the books are wrong.
export async function accountBalances(workspaceId: string) {
  const sql = await db()
  return sql<{ account: string; debit: number; credit: number }[]>`
    select l.account, sum(l.debit)::bigint as debit, sum(l.credit)::bigint as credit
    from ledger_line l join ledger_entry e on e.id = l.entry_id
    where e.workspace_id = ${workspaceId}
    group by l.account`
}

export type JournalEntry = {
  id: string
  date: string
  memo: string
  source_type: string
  lines: { account: string; debit: number; credit: number }[]
}

export async function journal(workspaceId: string, limit = 20) {
  const sql = await db()
  return sql<JournalEntry[]>`
    select e.id, e.date, e.memo, e.source_type,
      json_agg(json_build_object('account', l.account, 'debit', l.debit, 'credit', l.credit)
        order by l.debit desc, l.credit desc) as lines
    from ledger_entry e join ledger_line l on l.entry_id = e.id
    where e.workspace_id = ${workspaceId}
    group by e.id
    order by e.date desc, e.created_at desc
    limit ${limit}`
}
