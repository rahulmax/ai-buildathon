import { Back } from '@/components/back'
import { accountBalances, journal, profitForMonth } from '@/lib/books'
import { formatDate, todayIST } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { requireWorkspace } from '@/lib/workspace'

// Plain names for the ledger accounts, in the order a balance sheet reads.
// Debit accounts hold what you have or spent; credit accounts what you earned or owe.
const ACCOUNTS: { key: string; label: string; side: 'debit' | 'credit' }[] = [
  { key: 'bank', label: 'Bank', side: 'debit' },
  { key: 'receivable', label: 'Owed to you', side: 'debit' },
  { key: 'cgst_input', label: 'CGST paid', side: 'debit' },
  { key: 'sgst_input', label: 'SGST paid', side: 'debit' },
  { key: 'igst_input', label: 'IGST paid', side: 'debit' },
  { key: 'expenses', label: 'Expenses', side: 'debit' },
  { key: 'revenue', label: 'Sales', side: 'credit' },
  { key: 'cgst_payable', label: 'CGST collected', side: 'credit' },
  { key: 'sgst_payable', label: 'SGST collected', side: 'credit' },
  { key: 'igst_payable', label: 'IGST collected', side: 'credit' },
]

const label = (account: string) => ACCOUNTS.find((a) => a.key === account)?.label ?? account

const SOURCE: Record<string, string> = { invoice: 'Invoice', payment: 'Payment', bill: 'Bill' }

export default async function BooksPage() {
  const ws = await requireWorkspace()
  const month = todayIST().slice(0, 7)
  const [profit, balances, entries] = await Promise.all([
    profitForMonth(ws.id, month),
    accountBalances(ws.id),
    journal(ws.id),
  ])
  const monthLabel = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01`))

  const rows = ACCOUNTS.map((a) => {
    const b = balances.find((r) => r.account === a.key)
    const net = (b?.debit ?? 0) - (b?.credit ?? 0)
    return { ...a, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 }
  }).filter((r) => r.debit || r.credit)
  const totalDebit = rows.reduce((s, r) => s + r.debit, 0)
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0)

  return (
    <main className="shell stagger gap-6 py-6">
      <Back />
      <div className="rise flex flex-col gap-1.5">
        <h1 className="kicker">Profit for {monthLabel}</h1>
        <p className="amount text-4xl font-semibold">
          {profit.profit < 0 && '− '}
          {formatINR(Math.abs(profit.profit))}
        </p>
        <p className="text-sm text-muted-foreground">
          {profit.profit >= 0 ? 'You made this after expenses' : 'You spent more than you billed'}
        </p>
      </div>

      <dl className="card rise flex flex-col gap-2.5 p-5">
        <div className="flex justify-between">
          <dt>Sales, before GST</dt>
          <dd className="amount">{formatINR(profit.revenue)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Expenses</dt>
          <dd className="amount">− {formatINR(profit.expenses)}</dd>
        </div>
        {profit.categories.map((c) => (
          <div key={c.category} className="flex justify-between pl-4 text-sm text-muted-foreground">
            <dt className="capitalize">
              {c.category} · {c.bills} {c.bills === 1 ? 'bill' : 'bills'}
            </dt>
            <dd className="amount">{formatINR(c.amount)}</dd>
          </div>
        ))}
        <div className="flex justify-between border-t border-line pt-3 font-semibold">
          <dt>Profit</dt>
          <dd className="amount">
            {profit.profit < 0 && '− '}
            {formatINR(Math.abs(profit.profit))}
          </dd>
        </div>
      </dl>

      <section className="rise flex flex-col gap-2">
        <h2 className="kicker">Accounts</h2>
        {rows.length === 0 ? (
          <p className="card p-6 text-center text-muted-foreground">Nothing in the books yet. Say an invoice or snap a bill.</p>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-paper text-muted-foreground">
                <tr className="border-b border-line">
                  <th className="py-2.5 pl-4 text-left font-normal"></th>
                  <th className="py-2.5 text-right font-normal">Debit</th>
                  <th className="py-2.5 pr-4 text-right font-normal">Credit</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b border-line">
                    <td className="py-3 pl-4">{r.label}</td>
                    <td className="amount py-3 text-right">{r.debit ? formatINR(r.debit) : ''}</td>
                    <td className="amount py-3 pr-4 text-right">{r.credit ? formatINR(r.credit) : ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="font-semibold">
                <tr>
                  <td className="py-3 pl-4">Total</td>
                  <td className="amount py-3 text-right">{formatINR(totalDebit)}</td>
                  <td className="amount py-3 pr-4 text-right">{formatINR(totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {rows.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {totalDebit === totalCredit
              ? 'Debits equal credits. Your books balance.'
              : `Out by ${formatINR(Math.abs(totalDebit - totalCredit))}. Something is wrong.`}
          </p>
        )}
      </section>

      {entries.length > 0 && (
        <section className="rise flex flex-col gap-2">
          <h2 className="kicker">Journal</h2>
          <ul className="card overflow-hidden">
            {entries.map((e) => (
              <li key={e.id} className="flex flex-col gap-2 border-b border-line px-4 py-3 last:border-0">
                <div className="flex justify-between gap-3">
                  <span className="truncate font-medium">{e.memo}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {SOURCE[e.source_type] ?? e.source_type} · {formatDate(e.date)}
                  </span>
                </div>
                <dl className="flex flex-col gap-1 text-sm">
                  {e.lines.map((l, i) => (
                    <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-4">
                      <dt className={l.credit ? 'pl-4 text-muted-foreground' : ''}>{label(l.account)}</dt>
                      <dd className="amount w-24 text-right">{l.debit ? formatINR(l.debit) : ''}</dd>
                      <dd className="amount w-24 text-right">{l.credit ? formatINR(l.credit) : ''}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
