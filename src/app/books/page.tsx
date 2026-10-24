import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, CircleAlert, CircleCheck } from 'lucide-react'
import { Back } from '@/components/back'
import { CashflowChart, SpendDonut } from '@/components/books-charts'
import { BarList } from '@/components/tremor/bar-list'
import { accountBalances, journal, monthlyTotals, profitForMonth, whoOwesMe } from '@/lib/books'
import { formatDate, todayIST } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/utils'
import { requireWorkspace } from '@/lib/workspace'

// Plain names for the ledger accounts, in the order a balance sheet reads.
// Debit accounts hold what you have or spent; credit accounts what you earned or owe.
const ACCOUNTS: { key: string; label: string }[] = [
  { key: 'bank', label: 'Bank' },
  { key: 'receivable', label: 'Owed to you' },
  { key: 'cgst_input', label: 'CGST paid' },
  { key: 'sgst_input', label: 'SGST paid' },
  { key: 'igst_input', label: 'IGST paid' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'revenue', label: 'Sales' },
  { key: 'cgst_payable', label: 'CGST collected' },
  { key: 'sgst_payable', label: 'SGST collected' },
  { key: 'igst_payable', label: 'IGST collected' },
]

const accountLabel = (account: string) => ACCOUNTS.find((a) => a.key === account)?.label ?? account

const SOURCE: Record<string, string> = { invoice: 'Invoice', payment: 'Payment', bill: 'Bill' }

const monthName = (month: string, style: 'long' | 'short' = 'long') =>
  new Intl.DateTimeFormat('en-IN', { month: style, ...(style === 'long' && { year: 'numeric' }), timeZone: 'UTC' })
    .format(new Date(`${month}-01T00:00:00Z`))

const signed = (paise: number) => `${paise < 0 ? '− ' : ''}${formatINR(Math.abs(paise))}`

export default async function BooksPage() {
  const ws = await requireWorkspace()
  const month = todayIST().slice(0, 7)
  const [profit, monthly, balances, entries, owed] = await Promise.all([
    profitForMonth(ws.id, month),
    monthlyTotals(ws.id, month),
    accountBalances(ws.id),
    journal(ws.id, 8),
    whoOwesMe(ws.id),
  ])

  const last = monthly.at(-2)
  const lastName = last ? monthName(last.month, 'short') : ''
  const chart = monthly.map((m) => ({ month: monthName(m.month, 'short'), Sales: m.revenue, Expenses: m.expenses }))
  const hasHistory = monthly.some((m) => m.revenue || m.expenses)

  const rows = ACCOUNTS.map((a) => {
    const b = balances.find((r) => r.account === a.key)
    const net = (b?.debit ?? 0) - (b?.credit ?? 0)
    return { ...a, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 }
  }).filter((r) => r.debit || r.credit)
  const totalDebit = rows.reduce((s, r) => s + r.debit, 0)
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0)
  const balanced = totalDebit === totalCredit

  return (
    <main className="shell-wide stagger gap-6 py-6 md:gap-8 md:py-10">
      <Back />

      <header className="rise flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold md:text-3xl">Books</h1>
          <p className="text-sm text-muted-foreground">{monthName(month)} · read straight from your ledger</p>
        </div>
        {rows.length > 0 && (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1 text-sm font-medium sm:self-auto',
              balanced ? 'bg-ok-50 text-ok-700' : 'bg-crit-50 text-crit-700',
            )}
          >
            {balanced ? <CircleCheck className="size-4" /> : <CircleAlert className="size-4" />}
            {balanced ? 'Books balance' : `Out by ${formatINR(Math.abs(totalDebit - totalCredit))}`}
          </span>
        )}
      </header>

      <section className="rise grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <Stat label="Sales" value={formatINR(profit.revenue)} note={last ? `${formatINR(last.revenue)} in ${lastName}` : 'Before GST'} />
        <Stat label="Expenses" value={formatINR(profit.expenses)} note={last ? `${formatINR(last.expenses)} in ${lastName}` : 'Before GST'} />
        <Stat
          label="Profit"
          value={signed(profit.profit)}
          tone={profit.profit < 0 ? 'crit' : 'brand'}
          note={profit.profit < 0 ? 'Spent more than you billed' : 'Sales less expenses'}
        />
        <Stat
          label="Owed to you"
          value={formatINR(owed.total)}
          note={`${owed.invoices.length} open ${owed.invoices.length === 1 ? 'invoice' : 'invoices'}`}
          href="/owed"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Panel title="Sales and expenses" note="Last 6 months, before GST" className="lg:col-span-2">
          {hasHistory ? (
            <CashflowChart data={chart} />
          ) : (
            <Empty>Your first invoice starts this chart.</Empty>
          )}
        </Panel>
        <Panel title="Where the money went" note={`Expenses in ${monthName(month, 'short')}, by category`}>
          {profit.categories.length > 0 ? (
            <SpendDonut data={profit.categories.map((c) => ({ name: c.category, amount: c.amount }))} />
          ) : (
            <Empty>Snap a bill and it shows up here, with the GST you can claim back.</Empty>
          )}
        </Panel>
      </section>

      <section className="grid items-start gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel
            title="Who owes you"
            note={owed.customers.length ? `${formatINR(owed.total)} across ${owed.customers.length} ${owed.customers.length === 1 ? 'customer' : 'customers'}` : 'Read from the ledger'}
            action={owed.customers.length > 0 && <PanelLink href="/owed">Send reminders</PanelLink>}
          >
            {owed.customers.length > 0 ? (
              <BarList
                data={owed.customers.map((c) => ({ key: c.customer_id, name: c.name, value: c.balance }))}
                valueFormatter={formatINR}
              />
            ) : (
              <Empty>Nobody owes you anything right now.</Empty>
            )}
          </Panel>

          <Panel title="Accounts" note="Every balance since you started" flush>
            {rows.length === 0 ? (
              <div className="px-5 pb-5">
                <Empty>Nothing in the books yet. Say an invoice or snap a bill.</Empty>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr className="border-y border-line bg-paper">
                    <th className="py-2.5 pl-5 text-left font-normal">Account</th>
                    <th className="py-2.5 text-right font-normal">Debit</th>
                    <th className="py-2.5 pr-5 text-right font-normal">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className="border-b border-line">
                      <td className="py-2.5 pl-5">{r.label}</td>
                      <td className="amount py-2.5 text-right">{r.debit ? formatINR(r.debit) : ''}</td>
                      <td className="amount py-2.5 pr-5 text-right">{r.credit ? formatINR(r.credit) : ''}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="font-semibold">
                  <tr>
                    <td className="py-3 pl-5">Total</td>
                    <td className="amount py-3 text-right">{formatINR(totalDebit)}</td>
                    <td className="amount py-3 pr-5 text-right">{formatINR(totalCredit)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </Panel>
        </div>

        {entries.length > 0 && (
          <Panel title="Journal" note="The latest entries. Each one balances on its own." flush className="lg:col-span-2">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr className="border-y border-line bg-paper">
                  <th className="hidden py-2.5 pl-5 text-left font-normal md:table-cell md:w-32">Date</th>
                  <th className="py-2.5 pl-5 text-left font-normal md:pl-0">Account</th>
                  <th className="w-28 py-2.5 text-right font-normal">Debit</th>
                  <th className="w-28 py-2.5 pr-5 text-right font-normal md:w-32">Credit</th>
                </tr>
              </thead>
              {entries.map((e) => (
                <tbody key={e.id} className="border-b border-line last:border-0">
                  <tr>
                    <td className="hidden pt-3.5 pl-5 align-top text-muted-foreground md:table-cell" rowSpan={e.lines.length + 1}>
                      {formatDate(e.date)}
                    </td>
                    <td colSpan={3} className="px-5 pt-3.5 pb-1 md:pl-0">
                      <span className="font-medium">{e.memo}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {SOURCE[e.source_type] ?? e.source_type}
                        <span className="md:hidden"> · {formatDate(e.date)}</span>
                      </span>
                    </td>
                  </tr>
                  {e.lines.map((l, i) => (
                    <tr key={i} className="last:[&>td]:pb-3.5">
                      <td className={cn('py-0.5 pl-5 md:pl-0', l.credit ? 'pl-9 text-muted-foreground md:pl-4' : '')}>
                        {accountLabel(l.account)}
                      </td>
                      <td className="amount py-0.5 text-right">{l.debit ? formatINR(l.debit) : ''}</td>
                      <td className="amount py-0.5 pr-5 text-right">{l.credit ? formatINR(l.credit) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </Panel>
        )}
      </section>
    </main>
  )
}

function Stat({
  label,
  value,
  note,
  tone,
  href,
}: {
  label: string
  value: string
  note: string
  tone?: 'brand' | 'crit'
  href?: string
}) {
  const body = (
    <>
      <span className="kicker">{label}</span>
      <span
        className={cn(
          'amount text-xl font-semibold sm:text-2xl lg:text-3xl',
          tone === 'brand' && 'text-brand-700',
          tone === 'crit' && 'text-crit-600',
        )}
      >
        {value}
      </span>
      <span className="truncate text-xs text-muted-foreground">{note}</span>
    </>
  )
  const cls = 'card flex min-w-0 flex-col gap-1.5 p-4 md:p-5'
  return href ? (
    <Link href={href} className={cn(cls, 'lift')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

function Panel({
  title,
  note,
  action,
  flush,
  className,
  children,
}: {
  title: string
  note?: string
  action?: ReactNode
  flush?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <section className={cn('card rise flex min-w-0 flex-col gap-4 overflow-hidden', !flush && 'pb-5', className)}>
      <header className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-semibold">{title}</h2>
          {note && <p className="text-sm text-muted-foreground">{note}</p>}
        </div>
        {action}
      </header>
      <div className={cn(!flush && 'px-5')}>{children}</div>
    </section>
  )
}

function PanelLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline hover:underline-offset-2">
      {children} <ArrowRight className="size-3.5" />
    </Link>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="flex min-h-32 items-center justify-center rounded-xl border border-dashed border-line px-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}
