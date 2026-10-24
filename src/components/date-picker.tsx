'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from 'cn'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { addDays, daysBetween, formatDate, todayIST } from '@/lib/dates'

export type DatePreset = { label: string; days: number }

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const monthLabel = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const dayLabel = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

const utc = (date: string) => new Date(`${date}T00:00:00Z`)
const monthOf = (date: string) => `${date.slice(0, 7)}-01`
const addMonths = (month: string, n: number) => {
  const d = utc(month)
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 10)
}

// Six weeks from the Sunday on or before the 1st, so the grid never changes height.
function grid(month: string) {
  const start = addDays(month, -utc(month).getUTCDay())
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

// "in 7 days", "today", "3 days ago": how far a date is from today, in words.
function relative(date: string, today: string) {
  const n = daysBetween(today, date)
  if (n === 0) return 'today'
  if (n === 1) return 'tomorrow'
  if (n === -1) return 'yesterday'
  return n > 0 ? `in ${n} days` : `${-n} days ago`
}

export function DatePicker({
  id,
  value,
  onChange,
  min,
  max,
  presets = [],
  placeholder = 'Pick a date',
  clearable = false,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
  /** Quick picks counted in days from today: 7 for a week out, -1 for yesterday. */
  presets?: DatePreset[]
  placeholder?: string
  clearable?: boolean
}) {
  const today = todayIST()
  const [open, setOpen] = useState(false)
  const [focus, setFocus] = useState(value || today)
  const [month, setMonth] = useState(monthOf(value || today))
  // Opening lands on the selected day, so arrow keys work straight away.
  const focusedDay = useRef<HTMLButtonElement>(null)
  const keyed = useRef(false)

  // After a key moves the focus, follow it once the new month has rendered.
  useEffect(() => {
    if (!keyed.current) return
    keyed.current = false
    focusedDay.current?.focus()
  }, [focus])

  const disabled = (d: string) => Boolean((min && d < min) || (max && d > max))

  function openChange(next: boolean) {
    if (next) {
      setFocus(value || today)
      setMonth(monthOf(value || today))
    }
    setOpen(next)
  }

  function pick(d: string) {
    if (disabled(d)) return
    onChange(d)
    setOpen(false)
  }

  function moveFocus(d: string) {
    keyed.current = true
    setFocus(d)
    setMonth(monthOf(d))
  }

  function onKeyDown(e: KeyboardEvent) {
    const step: Record<string, () => string> = {
      ArrowLeft: () => addDays(focus, -1),
      ArrowRight: () => addDays(focus, 1),
      ArrowUp: () => addDays(focus, -7),
      ArrowDown: () => addDays(focus, 7),
      PageUp: () => addMonths(focus, -1),
      PageDown: () => addMonths(focus, 1),
      Home: () => addDays(focus, -utc(focus).getUTCDay()),
      End: () => addDays(focus, 6 - utc(focus).getUTCDay()),
    }
    if (step[e.key]) {
      e.preventDefault()
      moveFocus(step[e.key]())
    }
  }

  const canPrev = !min || addMonths(month, -1) >= monthOf(min)
  const canNext = !max || addMonths(month, 1) <= monthOf(max)

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger
        id={id}
        className={cn(
          'flex h-11 w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-surface px-3 text-left text-base outline-none transition-colors md:text-sm',
          'hover:border-ink/25 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40',
          open && 'border-ring ring-3 ring-ring/40',
        )}
      >
        <CalendarDays className="size-4 shrink-0 text-ink-muted" />
        {value ? (
          <span className="truncate">
            {formatDate(value)} <span className="text-muted-foreground">({relative(value, today)})</span>
          </span>
        ) : (
          <span className="truncate text-ink-muted">{placeholder}</span>
        )}
      </PopoverTrigger>

      <PopoverContent
        align="start"
        initialFocus={focusedDay}
        className="w-80 gap-3 rounded-2xl border border-line p-3 shadow-card-hover ring-0">
        <div className="flex items-center justify-between">
          <button
            type="button"
            aria-label="Previous month"
            disabled={!canPrev}
            onClick={() => setMonth(addMonths(month, -1))}
            className="flex size-9 items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-muted disabled:opacity-30"
          >
            <ChevronLeft className="size-4" />
          </button>
          <p className="text-sm font-semibold" aria-live="polite">
            {monthLabel.format(utc(month))}
          </p>
          <button
            type="button"
            aria-label="Next month"
            disabled={!canNext}
            onClick={() => setMonth(addMonths(month, 1))}
            className="flex size-9 items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-muted disabled:opacity-30"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        <div role="grid" aria-label={monthLabel.format(utc(month))} onKeyDown={onKeyDown} className="grid grid-cols-7 gap-y-1">
          {WEEKDAYS.map((w, i) => (
            <span key={i} role="columnheader" className="kicker flex h-7 items-center justify-center">
              {w}
            </span>
          ))}
          {grid(month).map((d) => {
            const inMonth = d.slice(0, 7) === month.slice(0, 7)
            const selected = d === value
            const isToday = d === today
            const off = disabled(d)
            return (
              <button
                key={d}
                type="button"
                role="gridcell"
                aria-label={dayLabel.format(utc(d))}
                aria-selected={selected}
                aria-current={isToday ? 'date' : undefined}
                disabled={off}
                ref={d === focus ? focusedDay : undefined}
                tabIndex={d === focus ? 0 : -1}
                onClick={() => pick(d)}
                onFocus={() => setFocus(d)}
                className={cn(
                  'relative mx-auto flex size-10 items-center justify-center rounded-full text-sm tabular-nums outline-none transition-colors duration-micro ease-ambient',
                  'focus-visible:ring-2 focus-visible:ring-ring/60',
                  inMonth ? 'text-ink' : 'text-ink-muted',
                  !selected && !off && 'hover:bg-brand-50 hover:text-brand-800 dark:hover:bg-brand-100',
                  isToday && !selected && 'font-semibold text-brand-700',
                  selected && 'bg-primary font-semibold text-primary-foreground shadow-sm',
                  off && 'cursor-not-allowed opacity-30',
                )}
              >
                {Number(d.slice(8))}
                {isToday && !selected && <span className="absolute bottom-1.5 size-1 rounded-full bg-brand-500" />}
              </button>
            )
          })}
        </div>

        {(presets.length > 0 || clearable) && (
          <div className="flex flex-wrap gap-1.5 border-t border-line pt-3">
            {presets.map((p) => {
              const d = addDays(today, p.days)
              return (
                <button
                  key={p.label}
                  type="button"
                  disabled={disabled(d)}
                  onClick={() => pick(d)}
                  className={cn(
                    'h-8 rounded-full border px-3 text-xs font-medium transition-colors disabled:opacity-30',
                    d === value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-line bg-paper text-ink-secondary hover:border-brand-300 hover:text-brand-800',
                  )}
                >
                  {p.label}
                </button>
              )
            })}
            {clearable && value && (
              <button
                type="button"
                onClick={() => {
                  onChange('')
                  setOpen(false)
                }}
                className="ml-auto h-8 rounded-full px-3 text-xs font-medium text-ink-muted hover:text-ink"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
