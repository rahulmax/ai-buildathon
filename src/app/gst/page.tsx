import { Back } from '@/components/back'
import { gstForMonth } from '@/lib/books'
import { todayIST } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { requireWorkspace } from '@/lib/workspace'

export default async function GstPage() {
  const ws = await requireWorkspace()
  const month = todayIST().slice(0, 7)
  const gst = await gstForMonth(ws.id, month)
  const label = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01`))

  return (
    <main className="shell stagger gap-6 py-6">
      <Back />
      <div className="rise flex flex-col gap-1.5">
        <h1 className="kicker">GST for {label}</h1>
        <p className="amount text-4xl font-semibold">{formatINR(Math.abs(gst.net))}</p>
        <p className="text-sm text-muted-foreground">
          {gst.net >= 0 ? 'To pay' : 'Credit carried forward to next month'}
        </p>
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
        <div className="flex justify-between border-t border-line pt-3 font-semibold">
          <dt>{gst.net >= 0 ? 'GST to pay' : 'Credit'}</dt>
          <dd className="amount">{formatINR(Math.abs(gst.net))}</dd>
        </div>
      </dl>

      <div className="card rise overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-paper text-muted-foreground">
          <tr className="border-b border-line">
            <th className="py-2.5 pl-4 text-left font-normal"></th>
            <th className="py-2 text-right font-normal">Collected</th>
            <th className="py-2 text-right font-normal">Paid</th>
            <th className="py-2.5 pr-4 text-right font-normal">Net</th>
          </tr>
        </thead>
        <tbody>
          {gst.heads.map((h) => (
            <tr key={h.head} className="border-b border-line last:border-0">
              <td className="kicker py-3 pl-4">{h.head}</td>
              <td className="amount py-3 text-right">{formatINR(h.collected)}</td>
              <td className="amount py-3 text-right">{formatINR(h.paid)}</td>
              <td className="amount py-3 pr-4 text-right font-medium">{formatINR(h.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {gst.paid === 0 && (
        <p className="text-sm text-muted-foreground">Snap your bills to claim back the GST you paid on them.</p>
      )}
    </main>
  )
}
