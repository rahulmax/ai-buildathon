import Link from 'next/link'
import { ChevronRight, FileText, Receipt, Settings } from 'lucide-react'
import { Capture } from '@/components/capture'
import { Landing } from '@/components/landing'
import { Mark } from '@/components/mark'
import { SaveEmail } from '@/components/save-email'
import { StartFresh } from '@/components/start-fresh'
import { gstForMonth, profitForMonth, recentActivity, whoOwesMe } from '@/lib/books'
import { formatDate, todayIST } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/utils'
import { currentWorkspace, workspaceServices } from '@/lib/workspace'

export default async function Home() {
  // No workspace yet: show the landing page. Its button leads to /start.
  const ws = await currentWorkspace()
  if (!ws) return <Landing />
  const month = todayIST().slice(0, 7)
  const [owed, gst, profit, recent, services] = await Promise.all([
    whoOwesMe(ws.id),
    gstForMonth(ws.id, month),
    profitForMonth(ws.id, month),
    recentActivity(ws.id),
    workspaceServices(ws.id),
  ])

  return (
    <main className="shell stagger gap-6 py-6">
      <header className="rise flex items-center gap-3">
        <Mark />
        <div className="flex min-w-0 flex-col">
          <p className="truncate font-semibold">{ws.name}</p>
          <p className="text-xs text-muted-foreground">{formatDate(todayIST())}</p>
        </div>
        <Link
          href="/settings"
          aria-label="Your details"
          className="ml-auto flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Settings className="size-5" />
        </Link>
      </header>

      <div className="rise">
        <Capture supplierState={ws.state} services={services} />
      </div>
      <SaveEmail ws={ws} />

      <section className="rise grid grid-cols-2 gap-3">
        <Link href="/owed" className="card lift flex flex-col gap-1.5 p-4">
          <span className="kicker">Who owes me</span>
          <span className="amount text-2xl font-semibold">{formatINR(owed.total)}</span>
          <span className="text-xs text-muted-foreground">
            {owed.invoices.length} open {owed.invoices.length === 1 ? 'invoice' : 'invoices'}
          </span>
        </Link>
        {ws.gstin && (
          <Link href="/gst" className="card lift flex flex-col gap-1.5 p-4">
            <span className="kicker">GST this month</span>
            <span className="amount text-2xl font-semibold">{formatINR(gst.credit > 0 ? gst.credit : gst.toPay)}</span>
            <span className="text-xs text-muted-foreground">
              {gst.credit > 0 ? 'Credit carried forward' : gst.carriedIn > 0 ? 'To pay, after earlier credit' : 'To pay'}
            </span>
          </Link>
        )}
        <Link
          href="/books"
          className={cn('card lift flex items-center justify-between gap-3 p-4', ws.gstin && 'col-span-2')}
        >
          <span className="flex min-w-0 flex-col gap-1.5">
            <span className="kicker">Profit this month</span>
            <span className="amount text-2xl font-semibold">
              {profit.profit < 0 && '− '}
              {formatINR(Math.abs(profit.profit))}
            </span>
            <span className="text-xs text-muted-foreground">Sales less expenses · see your books</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-ink-muted" />
        </Link>
      </section>
      <Link href="/invoices" className="rise card lift flex items-center justify-between gap-3 px-4 py-3 font-medium">All invoices<ChevronRight className="size-4 text-ink-muted" /></Link>

      {recent.length > 0 && (
        <section className="rise flex flex-col gap-2">
          <h2 className="kicker">Recent</h2>
          <div className="card overflow-hidden">
            {recent.map((r) => {
              const row = (
                <>
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 dark:bg-brand-100">
                    {r.kind === 'invoice' ? <FileText className="size-4" /> : <Receipt className="size-4" />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{r.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {r.kind === 'invoice' ? (r.status === 'paid' ? 'Paid' : r.status === 'cancelled' ? 'Cancelled' : 'Invoice') : 'Bill'} · {formatDate(r.date)}
                    </span>
                  </span>
                  <span className="amount text-sm font-medium">{formatINR(r.amount)}</span>
                  {r.slug && <ChevronRight className="size-4 text-ink-muted" />}
                </>
              )
              const cls = 'flex items-center gap-3 border-b border-line px-4 py-3 last:border-0'
              return r.slug ? (
                <Link key={r.id} href={`/i/${r.slug}`} className={`${cls} transition-colors hover:bg-muted`}>
                  {row}
                </Link>
              ) : (
                <div key={r.id} className={cls}>
                  {row}
                </div>
              )
            })}
          </div>
        </section>
      )}
      <StartFresh saved={Boolean(ws.email)} />
    </main>
  )
}
