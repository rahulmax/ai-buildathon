// Tremor Raw's chart tooltip and legend (tremor.so, Apache-2.0), restyled
// with this app's tokens.
import { cn } from '@/lib/utils'
import { getColorClassName, type ChartColor } from './chart-utils'

export type TooltipEntry = {
  category: string
  value: number
  color: ChartColor
}

export function ChartTooltip({
  label,
  entries,
  valueFormatter,
}: {
  label?: string
  entries: TooltipEntry[]
  valueFormatter: (value: number) => string
}) {
  if (entries.length === 0) return null
  return (
    <div className="rounded-lg border border-line bg-overlay text-sm shadow-card-hover">
      {label ? (
        <div className="border-b border-line px-3.5 py-2">
          <p className="font-medium text-ink">{label}</p>
        </div>
      ) : null}
      <div className="flex flex-col gap-1 px-3.5 py-2">
        {entries.map(({ category, value, color }) => (
          <div key={category} className="flex items-center justify-between gap-8">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className={cn('h-[3px] w-3.5 shrink-0 rounded-full', getColorClassName(color, 'bg'))} />
              <p className="whitespace-nowrap text-ink-secondary">{category}</p>
            </div>
            <p className="amount whitespace-nowrap font-medium text-ink">{valueFormatter(value)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ChartLegend({
  categories,
  colors,
  className,
}: {
  categories: string[]
  colors: Map<string, ChartColor>
  className?: string
}) {
  return (
    <ol className={cn('flex flex-wrap items-center gap-x-4 gap-y-1', className)}>
      {categories.map((category) => (
        <li key={category} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn('h-[3px] w-3.5 shrink-0 rounded-full', getColorClassName(colors.get(category) ?? 'mist', 'bg'))}
          />
          <span className="truncate whitespace-nowrap text-xs text-ink-secondary">{category}</span>
        </li>
      ))}
    </ol>
  )
}

type RechartsPayload = {
  dataKey?: unknown
  name?: unknown
  value?: unknown
}

// Recharts' tooltip payload as Tremor's tooltip entries.
export function tooltipEntries(payload: readonly RechartsPayload[] | undefined, colors: Map<string, ChartColor>): TooltipEntry[] {
  return (payload ?? []).map((item) => {
    const category = String(item.dataKey ?? item.name ?? '')
    return { category, value: Number(item.value ?? 0), color: colors.get(category) ?? 'mist' }
  })
}
