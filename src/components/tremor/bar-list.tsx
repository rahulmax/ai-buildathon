// Tremor Raw BarList (tremor.so, Apache-2.0), coloured from the chart tokens.
// Plain HTML, no recharts, so it renders on the server.
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { getColorClassName, type ChartColor } from './chart-utils'

export type BarListItem = {
  key: string | number
  name: string
  value: number
  href?: string
}

export function BarList({
  data,
  color = 'blue',
  valueFormatter = (value) => value.toString(),
  className,
}: {
  data: BarListItem[]
  color?: ChartColor
  valueFormatter?: (value: number) => string
  className?: string
}) {
  const max = Math.max(...data.map((item) => item.value), 0)
  const width = (value: number) => (max === 0 ? 0 : Math.max((value / max) * 100, 2))

  return (
    <div className={cn('flex justify-between gap-6', className)}>
      <div className="relative flex w-full flex-col gap-1.5">
        {data.map((item) => (
          <div key={item.key} className="flex w-full items-center">
            <div
              className={cn('flex h-8 items-center rounded-sm', getColorClassName(color, 'soft'))}
              style={{ width: `${width(item.value)}%` }}
            >
              <div className="absolute left-2.5 flex max-w-full pr-2.5">
                {item.href ? (
                  <Link href={item.href} className="truncate whitespace-nowrap text-sm text-ink hover:underline hover:underline-offset-2">
                    {item.name}
                  </Link>
                ) : (
                  <p className="truncate whitespace-nowrap text-sm text-ink">{item.name}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        {data.map((item) => (
          <div key={item.key} className="flex h-8 items-center justify-end">
            <p className="amount truncate whitespace-nowrap text-sm leading-none text-ink">{valueFormatter(item.value)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
