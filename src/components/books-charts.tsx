'use client'

import { BarChart } from '@/components/tremor/bar-chart'
import { getColorClassName, seriesColors } from '@/components/tremor/chart-utils'
import { DonutChart } from '@/components/tremor/donut-chart'
import { cn } from '@/lib/utils'
import { formatCompactINR, formatINR } from '@/lib/money'

// Charts take paise, like everything else. Formatters live here because a
// server page can't hand functions to a client component.

export function CashflowChart({ data }: { data: { month: string; Sales: number; Expenses: number }[] }) {
  return (
    <BarChart
      data={data}
      index="month"
      categories={['Sales', 'Expenses']}
      valueFormatter={formatINR}
      axisFormatter={formatCompactINR}
      barCategoryGap="28%"
      className="h-64 md:h-72"
    />
  )
}

export function SpendDonut({ data }: { data: { name: string; amount: number }[] }) {
  const total = data.reduce((s, d) => s + d.amount, 0)
  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row lg:flex-col">
      <DonutChart
        data={data}
        category="name"
        value="amount"
        valueFormatter={formatINR}
        label={formatCompactINR(total)}
        className="size-36 shrink-0"
      />
      <ul className="flex w-full flex-col gap-2 text-sm">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2.5">
            <span aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-sm', getColorClassName(seriesColors[i] ?? 'mist', 'bg'))} />
            <span className="flex-1 truncate capitalize">{d.name}</span>
            <span className="amount text-ink-muted">{Math.round((d.amount / total) * 100)}%</span>
            <span className="amount w-20 text-right font-medium">{formatINR(d.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
