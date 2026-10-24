'use client'

// Tremor Raw BarChart (tremor.so, Apache-2.0), trimmed to vertical bars,
// grouped or stacked, and coloured from the chart tokens.
import { Bar, CartesianGrid, BarChart as RechartsBarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { cn } from '@/lib/utils'
import { ChartLegend, ChartTooltip, tooltipEntries } from './chart-parts'
import { constructCategoryColors, getColorClassName, seriesColors, type ChartColor } from './chart-utils'

export type BarChartProps = {
  data: Record<string, unknown>[]
  index: string
  categories: string[]
  colors?: ChartColor[]
  valueFormatter?: (value: number) => string
  axisFormatter?: (value: number) => string
  labelFormatter?: (label: string) => string
  showLegend?: boolean
  barCategoryGap?: string | number
  stack?: boolean
  className?: string
}

export function BarChart({
  data,
  index,
  categories,
  colors = seriesColors,
  valueFormatter = (value) => value.toString(),
  axisFormatter = valueFormatter,
  labelFormatter = (label) => label,
  showLegend = true,
  barCategoryGap = '20%',
  stack = false,
  className,
}: BarChartProps) {
  const categoryColors = constructCategoryColors(categories, colors)

  return (
    <div className={cn('flex h-72 w-full flex-col gap-3', className)}>
      {showLegend ? <ChartLegend categories={categories} colors={categoryColors} className="justify-end" /> : null}
      <div className="min-h-0 flex-1">
        <ResponsiveContainer>
          <RechartsBarChart data={data} margin={{ bottom: 0, left: 0, right: 0, top: 5 }} barCategoryGap={barCategoryGap}>
            <CartesianGrid className="stroke-chart-grid stroke-1" horizontal vertical={false} />
            {/* Recharts 3 renders tick labels outside the axis group, so their classes ride on `tick`. */}
            <XAxis
              dataKey={index}
              tick={{ transform: 'translate(0, 6)', className: 'fill-ink-muted text-xs' }}
              tickFormatter={labelFormatter}
              fill=""
              stroke=""
              tickLine={false}
              axisLine={false}
              minTickGap={5}
              interval="equidistantPreserveStart"
            />
            <YAxis
              width={64}
              axisLine={false}
              tickLine={false}
              type="number"
              tick={{ transform: 'translate(-3, 0)', className: 'fill-ink-muted text-xs tabular-nums' }}
              fill=""
              stroke=""
              tickFormatter={axisFormatter}
            />
            <Tooltip
              wrapperStyle={{ outline: 'none' }}
              isAnimationActive={false}
              cursor={{ fill: 'var(--muted)' }}
              content={({ active, payload, label }) =>
                active ? (
                  <ChartTooltip
                    label={labelFormatter(String(label ?? ''))}
                    entries={tooltipEntries(payload, categoryColors)}
                    valueFormatter={valueFormatter}
                  />
                ) : null
              }
            />
            {categories.map((category, position) => (
              <Bar
                key={category}
                stackId={stack ? 'stack' : undefined}
                className={getColorClassName(categoryColors.get(category) ?? 'mist', 'fill')}
                fill=""
                dataKey={category}
                maxBarSize={40}
                radius={stack && position < categories.length - 1 ? 0 : [3, 3, 0, 0]}
                isAnimationActive={false}
              />
            ))}
          </RechartsBarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
