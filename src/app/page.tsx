import Link from 'next/link'
import { ChevronRight, FileText, Receipt } from 'lucide-react'
import { Capture } from '@/components/capture'
import { gstForMonth, recentActivity, whoOwesMe } from '@/lib/books'
import { formatDate, todayIST } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { requireWorkspace } from '@/lib/workspace'

export default async function Home() {
  const ws = await requireWorkspace()
  const month = todayIST().slice(0, 7)
  const [owed, gst, recent] = await Promise.all([
    whoOwesMe(ws.id),
    gstForMonth(ws.id, month),
    recentActivity(ws.id),
  ])

  return (
    <main className="shell gap-6 py-6">
      <header className="flex items-center justify-between">
        <p className="font-medium">{ws.name}</p>
      </header>

      <Capture supplierState={ws.state} />

      <section className="grid grid-cols-2 gap-3">
        <Link href="/owed" className="flex flex-col gap-1 rounded-2xl border p-4 hover:bg-muted/50">
          <span className="text-sm text-muted-foreground">Who owes me</span>
          <span className="amount text-2xl font-semibold">{formatINR(owed.total)}</span>
          <span className="text-xs text-muted-foreground">
            {owed.invoices.length} open {owed.invoices.length === 1 ? 'invoice' : 'invoices'}
          </span>
        </Link>
        <Link href="/gst" className="flex flex-col gap-1 rounded-2xl border p-4 hover:bg-muted/50">
          <span className="text-sm text-muted-foreground">GST this month</span>
          <span className="amount text-2xl font-semibold">{formatINR(Math.max(gst.net, 0))}</span>
          <span className="text-xs text-muted-foreground">{gst.net < 0 ? 'Credit carried forward' : 'To pay'}</span>
        </Link>
      </section>

      {recent.length > 0 && (
        <section className="flex flex-col">
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Recent</h2>
          {recent.map((r) => {
            const row = (
              <>
                {r.kind === 'invoice' ? (
                  <FileText className="size-4 text-muted-foreground" />
                ) : (
                  <Receipt className="size-4 text-muted-foreground" />
                )}
                <span className="flex flex-1 flex-col">
                  <span>{r.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.kind === 'invoice' ? (r.status === 'paid' ? 'Paid' : 'Invoice') : 'Bill'} · {formatDate(r.date)}
                  </span>
                </span>
                <span className="amount">{formatINR(r.amount)}</span>
                {r.slug && <ChevronRight className="size-4 text-muted-foreground" />}
              </>
            )
            return r.slug ? (
              <Link key={r.id} href={`/i/${r.slug}`} className="flex items-center gap-3 border-b py-3 last:border-0">
                {row}
              </Link>
            ) : (
              <div key={r.id} className="flex items-center gap-3 border-b py-3 last:border-0">
                {row}
              </div>
            )
          })}
        </section>
      )}
    </main>
  )
}
