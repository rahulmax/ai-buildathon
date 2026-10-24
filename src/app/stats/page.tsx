import { statsToday } from '@/lib/books'
import { formatINR } from '@/lib/money'

export const dynamic = 'force-dynamic'

export default async function StatsPage() {
  const s = await statsToday()
  const tiles = [
    { label: 'Invoiced today', value: formatINR(s.invoiced) },
    { label: 'People', value: s.users },
    { label: 'Invoices', value: s.invoices },
    { label: 'Bills', value: s.bills },
    { label: 'Reminders sent', value: s.chases },
  ]
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-4 py-10">
      <div className="rise flex flex-col gap-3">
        <p className="kicker">{tiles[0].label}</p>
        <p className="amount text-6xl font-semibold text-brand-700 sm:text-8xl">{tiles[0].value}</p>
      </div>
      <dl className="stagger grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.slice(1).map((t) => (
          <div key={t.label} className="card rise flex flex-col gap-1.5 p-5">
            <dt className="kicker">{t.label}</dt>
            <dd className="amount text-4xl font-semibold">{t.value}</dd>
          </div>
        ))}
      </dl>
    </main>
  )
}
