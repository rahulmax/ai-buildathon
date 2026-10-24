import Link from 'next/link'
import { Back } from '@/components/back'
import { Chase } from '@/components/chase'
import { Badge } from '@/components/ui/badge'
import { whoOwesMe } from '@/lib/books'
import { daysBetween, formatDate, todayIST } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { requireWorkspace } from '@/lib/workspace'

export default async function OwedPage() {
  const ws = await requireWorkspace()
  const owed = await whoOwesMe(ws.id)
  const today = todayIST()

  return (
    <main className="shell gap-6 py-6">
      <Back />
      <div className="flex flex-col gap-1">
        <h1 className="text-sm text-muted-foreground">Who owes me</h1>
        <p className="amount text-4xl font-semibold">{formatINR(owed.total)}</p>
        {owed.customers.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {owed.customers.map((c) => `${c.name} ${formatINR(c.balance)}`).join(' · ')}
          </p>
        )}
      </div>

      {owed.invoices.length === 0 && <p className="text-muted-foreground">Nobody owes you anything. Nice.</p>}

      <ul className="flex flex-col gap-3">
        {owed.invoices.map((inv) => {
          const late = daysBetween(inv.due_date ?? inv.issue_date, today)
          return (
            <li key={inv.id} className="flex flex-col gap-3 rounded-2xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <Link href={`/i/${inv.public_slug}`} className="flex flex-col">
                  <span className="font-medium">{inv.customer_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {inv.number} · {inv.due_date ? `due ${formatDate(inv.due_date)}` : `sent ${formatDate(inv.issue_date)}`}
                  </span>
                </Link>
                <div className="flex flex-col items-end gap-1">
                  <span className="amount text-lg font-semibold">{formatINR(inv.total)}</span>
                  {inv.due_date && late > 0 && <Badge variant="destructive">{late} days late</Badge>}
                </div>
              </div>
              <Chase invoiceId={inv.id} />
            </li>
          )
        })}
      </ul>
    </main>
  )
}
