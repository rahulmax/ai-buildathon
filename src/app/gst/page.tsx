import { Back } from '@/components/back'
import { gstForMonth } from '@/lib/books'
import { todayIST } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { requireWorkspace } from '@/lib/workspace'

export default async function GstPage() {
  const ws = await requireWorkspace()
  const month = todayIST().slice(0, 7)
  const label = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01`))

  // No GSTIN, no GST: invoices go out as bills of supply.
  if (!ws.gstin) {
    return (
      <main className="shell stagger gap-6 py-6">
        <Back />
        <div className="rise flex flex-col gap-1.5">
          <h1 className="kicker">GST for {label}</h1>
          <p className="text-xl font-semibold">Nothing to pay</p>
        </div>
        <p className="card rise p-5 text-sm text-muted-foreground">
          You don&apos;t have a GSTIN, so you don&apos;t collect GST. Your invoices are bills of supply.
        </p>
      </main>
    )
  }

  const gst = await gstForMonth(ws.id, month)
  const owes = gst.toPay > 0 || gst.credit === 0

  return (
    <main className="shell stagger gap-6 py-6">
      <Back />
      <div className="rise flex flex-col gap-1.5">
        <h1 className="kicker">GST for {label}</h1>
        <p className="text-sm text-muted-foreground">{owes ? 'GST to pay' : 'Credit carried forward'}</p>
        <p className="amount text-4xl font-semibold">{formatINR(owes ? gst.toPay : gst.credit)}</p>
        {!owes && <p className="text-sm text-muted-foreground">It comes off next month&apos;s GST.</p>}
      </div>

      <dl className="card rise flex flex-col gap-2.5 p-5">
        <div className="flex justify-between">
          <dt>Collected on invoices</dt>
          <dd className="amount">{formatINR(gst.collected)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Paid on bills</dt>
          <dd className="amount">− {formatINR(gst.paid)}</dd>
        </div>
        {gst.carriedIn > 0 && (
          <div className="flex justify-between">
            <dt>Credit from earlier months</dt>
            <dd className="amount">− {formatINR(gst.carriedIn)}</dd>
          </div>
        )}
        <div className="flex justify-between border-t border-line pt-3 font-semibold">
          <dt>{owes ? 'GST to pay' : 'Credit carried forward'}</dt>
          <dd className="amount">{formatINR(owes ? gst.toPay : gst.credit)}</dd>
        </div>
      </dl>

      <div className="rise flex flex-col gap-2">
        <h2 className="kicker">By head, this month</h2>
        <div className="card overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-paper text-muted-foreground">
              <tr className="border-b border-line">
                <th className="py-2 pl-4 text-left font-normal"></th>
                <th className="py-2 text-right font-normal">Collected</th>
                <th className="py-2 pr-4 text-right font-normal">Paid on bills</th>
              </tr>
            </thead>
            <tbody>
              {gst.heads.map((h) => (
                <tr key={h.head} className="border-b border-line last:border-0">
                  <td className="kicker py-2.5 pl-4">{h.head}</td>
                  <td className="amount py-2.5 text-right">{formatINR(h.collected)}</td>
                  <td className="amount py-2.5 pr-4 text-right">{formatINR(h.paid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {gst.paid === 0 && (
        <p className="text-sm text-muted-foreground">Snap your bills to claim back the GST you paid on them.</p>
      )}
    </main>
  )
}
