// Tremor Raw's chart utilities (tremor.so, Apache-2.0), with Tremor's
// Tailwind palette swapped for the chart tokens in globals.css. Class names
// are written out whole so Tailwind finds them.

export type ColorUtility = 'bg' | 'stroke' | 'fill' | 'text' | 'soft'

export const chartColors = {
  blue: { bg: 'bg-chart-blue', stroke: 'stroke-chart-blue', fill: 'fill-chart-blue', text: 'text-chart-blue', soft: 'bg-chart-blue-soft' },
  coral: { bg: 'bg-chart-coral', stroke: 'stroke-chart-coral', fill: 'fill-chart-coral', text: 'text-chart-coral', soft: 'bg-chart-coral-soft' },
  teal: { bg: 'bg-chart-teal', stroke: 'stroke-chart-teal', fill: 'fill-chart-teal', text: 'text-chart-teal', soft: 'bg-chart-teal-soft' },
  violet: { bg: 'bg-chart-violet', stroke: 'stroke-chart-violet', fill: 'fill-chart-violet', text: 'text-chart-violet', soft: 'bg-chart-violet-soft' },
  pink: { bg: 'bg-chart-pink', stroke: 'stroke-chart-pink', fill: 'fill-chart-pink', text: 'text-chart-pink', soft: 'bg-chart-pink-soft' },
  amber: { bg: 'bg-chart-amber', stroke: 'stroke-chart-amber', fill: 'fill-chart-amber', text: 'text-chart-amber', soft: 'bg-chart-amber-soft' },
  mist: { bg: 'bg-chart-mist', stroke: 'stroke-chart-mist', fill: 'fill-chart-mist', text: 'text-chart-mist', soft: 'bg-chart-mist-soft' },
} as const satisfies Record<string, Record<ColorUtility, string>>

export type ChartColor = keyof typeof chartColors

// Unrelated series take the categorical set in this order, never cycled.
// `mist` stays out: it is the baseline and the "Other" bucket.
export const seriesColors: ChartColor[] = ['blue', 'coral', 'teal', 'violet', 'pink', 'amber']

export function constructCategoryColors(categories: string[], colors: ChartColor[]) {
  const categoryColors = new Map<string, ChartColor>()
  categories.forEach((category, index) => {
    categoryColors.set(category, colors[index] ?? 'mist')
  })
  return categoryColors
}

export function getColorClassName(color: ChartColor, type: ColorUtility) {
  return chartColors[color]?.[type] ?? chartColors.mist[type]
}
