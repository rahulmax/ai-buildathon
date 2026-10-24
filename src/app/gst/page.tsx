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
    <main className="shell gap-6 py-6">
      <Back />
      <div className="flex flex-col gap-1">
        <h1 className="text-sm text-muted-foreground">GST for {label}</h1>
        <p className="amount text-4xl font-semibold">{formatINR(Math.abs(gst.net))}</p>
        <p className="text-sm text-muted-foreground">
          {gst.net >= 0 ? 'To pay' : 'Credit carried forward to next month'}
        </p>
      </div>

      <dl className="flex flex-col gap-2 rounded-2xl border p-4">
        <div className="flex justify-between">
          <dt>Collected on invoices</dt>
          <dd className="amount">{formatINR(gst.collected)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Paid on bills</dt>
          <dd className="amount">− {formatINR(gst.paid)}</dd>
        </div>
        <div className="flex justify-between border-t pt-2 font-medium">
          <dt>{gst.net >= 0 ? 'GST to pay' : 'Credit'}</dt>
          <dd className="amount">{formatINR(Math.abs(gst.net))}</dd>
        </div>
      </dl>

      <table className="w-full text-sm">
        <thead className="text-muted-foreground">
          <tr className="border-b">
            <th className="py-2 text-left font-normal"></th>
            <th className="py-2 text-right font-normal">Collected</th>
            <th className="py-2 text-right font-normal">Paid</th>
            <th className="py-2 text-right font-normal">Net</th>
          </tr>
        </thead>
        <tbody>
          {gst.heads.map((h) => (
            <tr key={h.head} className="border-b last:border-0">
              <td className="py-2 uppercase">{h.head}</td>
              <td className="amount py-2 text-right">{formatINR(h.collected)}</td>
              <td className="amount py-2 text-right">{formatINR(h.paid)}</td>
              <td className="amount py-2 text-right">{formatINR(h.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {gst.paid === 0 && (
        <p className="text-sm text-muted-foreground">Snap your bills to claim back the GST you paid on them.</p>
      )}
    </main>
  )
}
