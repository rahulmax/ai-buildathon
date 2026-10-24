'use client'

// Tremor Raw DonutChart (tremor.so, Apache-2.0), coloured from the chart tokens.
import { Cell, Pie, PieChart as RechartsPieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { cn } from '@/lib/utils'
import { ChartTooltip } from './chart-parts'
import { getColorClassName, seriesColors, type ChartColor } from './chart-utils'

export type DonutChartProps = {
  data: Record<string, unknown>[]
  category: string
  value: string
  colors?: ChartColor[]
  valueFormatter?: (value: number) => string
  label?: string
  className?: string
}

export function DonutChart({
  data,
  category,
  value,
  colors = seriesColors,
  valueFormatter = (amount) => amount.toString(),
  label,
  className,
}: DonutChartProps) {
  const colorOf = (index: number): ChartColor => colors[index] ?? 'mist'

  return (
    <div className={cn('size-40', className)}>
      <ResponsiveContainer>
        <RechartsPieChart margin={{ top: 0, left: 0, right: 0, bottom: 0 }}>
          {label ? (
            <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="fill-ink text-sm font-semibold tabular-nums">
              {label}
            </text>
          ) : null}
          <Pie
            className="stroke-surface [&_.recharts-pie-sector]:outline-none"
            data={data}
            cx="50%"
            cy="50%"
            startAngle={90}
            endAngle={-270}
            innerRadius="72%"
            outerRadius="100%"
            stroke=""
            strokeWidth={2}
            dataKey={value}
            nameKey={category}
            isAnimationActive={false}
          >
            {data.map((_, index) => (
              <Cell key={index} className={getColorClassName(colorOf(index), 'fill')} fill="" />
            ))}
          </Pie>
          <Tooltip
            wrapperStyle={{ outline: 'none', zIndex: 10 }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const item = payload?.[0]
              if (!active || !item) return null
              const index = data.findIndex((row) => row[category] === item.name)
              return (
                <ChartTooltip
                  entries={[{ category: String(item.name ?? ''), value: Number(item.value ?? 0), color: colorOf(index) }]}
                  valueFormatter={valueFormatter}
                />
              )
            }}
          />
        </RechartsPieChart>
      </ResponsiveContainer>
    </div>
  )
}
