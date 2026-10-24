'use client'

import { useState, useTransition } from 'react'
import { Bot, Landmark, type LucideIcon, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { createBill } from '@/app/actions'
import { DatePicker } from '@/components/date-picker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { addsUp, claimsGst, gstSplitNote } from '@/lib/bills'
import { todayIST } from '@/lib/dates'
import { formatINR, toPaise } from '@/lib/money'
import { BILL_CATEGORIES, type BillReading } from '@/lib/schemas'

const str = (n: number | null | undefined) => (n != null ? String(n) : '')
const paise = (s: string) => toPaise(Number(s.replace(/,/g, '')) || 0)
const note = 'text-xs rounded-lg bg-warn-50 px-3 py-2 text-warn-700 dark:bg-warn-100'

type PaidFrom = 'bank' | 'personal'
const PAID_FROM: { value: PaidFrom; label: string; Icon: LucideIcon }[] = [
  { value: 'bank', label: 'Paid from bank', Icon: Landmark },
  { value: 'personal', label: 'Paid personally', Icon: Wallet },
]

export function BillConfirm({
  extract,
  supplierState,
  onCancel,
  onSaved,
}: {
  extract: BillReading | null
  supplierState: string
  onCancel: () => void
  onSaved: () => void
}) {
  const [pending, start] = useTransition()
  const [seller, setSeller] = useState(extract?.seller_name ?? '')
  const [gstin, setGstin] = useState(extract?.seller_gstin ?? '')
  const [date, setDate] = useState(extract?.bill_date ?? todayIST())
  const [category, setCategory] = useState<string>(extract?.category ?? 'food')
  const [total, setTotal] = useState(str(extract?.total_rupees))
  const [cgst, setCgst] = useState(str(extract?.cgst_rupees))
  const [sgst, setSgst] = useState(str(extract?.sgst_rupees))
  const [igst, setIgst] = useState(str(extract?.igst_rupees))
  const [paidFrom, setPaidFrom] = useState<PaidFrom>('bank')
  // The seller, date and total the server called a likely repeat. Editing any
  // of them clears the warning.
  const [dupOf, setDupOf] = useState<string | null>(null)

  const food = category === 'food'
  const claimable = claimsGst(category, gstin.trim())
  const gst = paise(cgst) + paise(sgst) + paise(igst)
  const ready = seller.trim() && paise(total) > 0 && gst < paise(total)
  const printedSubtotal = extract?.subtotal_rupees != null ? toPaise(extract.subtotal_rupees) : null
  const offTotal = paise(total) > 0 && !addsUp(printedSubtotal, paise(total), gst)
  const splitNote = claimable ? gstSplitNote(gstin.trim(), supplierState, paise(cgst), paise(sgst), paise(igst)) : null
  const key = [seller.trim().toLowerCase(), date, paise(total)].join('|')
  const duplicate = dupOf === key

  function save(force = false) {
    start(async () => {
      try {
        const r = await createBill(
          {
            seller_name: seller.trim(),
            seller_gstin: gstin.trim(),
            bill_date: date,
            category: category as (typeof BILL_CATEGORIES)[number],
            paid_from: paidFrom,
            subtotal: paise(total) - gst,
            cgst: paise(cgst),
            sgst: paise(sgst),
            igst: paise(igst),
            total: paise(total),
          },
          { force },
        )
        if (r.duplicate) {
          setDupOf(key)
          return
        }
        toast.success(
          r.claimed > 0
            ? `Logged. ${formatINR(r.claimed)} GST to claim back.`
            : food && gst > 0
              ? 'Logged as an expense. GST on food can’t be claimed back.'
              : 'Logged as an expense.',
        )
        onSaved()
      } catch (e) {
        console.error(e)
        toast.error('Couldn’t save the bill. Try again.')
      }
    })
  }

  return (
    <div className="card rise flex flex-col gap-5 p-5">
      <div className="flex flex-col gap-1.5">
        <p className="kicker">Check your bill</p>
        {extract && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Bot className="mt-px size-3.5 shrink-0" />
            <span>
              {extract.source === 'agenticorg' ? 'Bill reader agent on AgenticOrg' : 'Read by Claude'}
              {extract.check && <> · {extract.check}</>}
            </span>
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="seller">Seller</Label>
        <Input id="seller" value={seller} onChange={(e) => setSeller(e.target.value)} className="h-11 text-lg" />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="total">Total paid</Label>
        <div className="relative">
          <span className="absolute top-1/2 left-3 -translate-y-1/2 text-xl text-muted-foreground">₹</span>
          <Input
            id="total"
            inputMode="decimal"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            className="amount h-14 pl-8 text-2xl md:text-2xl"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-3 gap-2">
          {[
            ['CGST', cgst, setCgst],
            ['SGST', sgst, setSgst],
            ['IGST', igst, setIgst],
          ].map(([label, value, set]) => (
            <div key={label as string} className="flex flex-col gap-2">
              <Label htmlFor={label as string}>{label as string} ₹</Label>
              <Input
                id={label as string}
                inputMode="decimal"
                className="amount"
                value={value as string}
                onChange={(e) => (set as (v: string) => void)(e.target.value)}
              />
            </div>
          ))}
        </div>
        {offTotal && <p className={note}>These numbers don’t add up. Check the total and GST.</p>}
        {splitNote && <p className={note}>{splitNote}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="gstin">Seller’s GSTIN</Label>
        <Input
          id="gstin"
          autoCapitalize="characters"
          value={gstin}
          onChange={(e) => setGstin(e.target.value.toUpperCase())}
          className="font-mono"
        />
        {gst > 0 && !food && !claimable && (
          <p className={note}>No GSTIN on this bill, so its GST can’t be claimed. The whole amount goes to expenses.</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="date">Date</Label>
            <DatePicker
              id="date"
              value={date}
              onChange={(d) => setDate(d || todayIST())}
              max={todayIST()}
              presets={[
                { label: 'Today', days: 0 },
                { label: 'Yesterday', days: -1 },
              ]}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="category">Category</Label>
            <select id="category" value={category} onChange={(e) => setCategory(e.target.value)} className="field capitalize">
              {BILL_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
        {food && gst > 0 && <p className={note}>GST on food can’t be claimed back. The whole amount goes to expenses.</p>}
      </div>

      <div className="flex flex-col gap-2">
        <div role="group" aria-label="Paid from" className="grid grid-cols-2 gap-2">
          {PAID_FROM.map(({ value, label, Icon }) => (
            <Button
              key={value}
              type="button"
              variant={paidFrom === value ? 'default' : 'outline'}
              size="lg"
              aria-pressed={paidFrom === value}
              onClick={() => setPaidFrom(value)}
              className="px-3 text-sm"
            >
              <Icon data-icon="inline-start" />
              {label}
            </Button>
          ))}
        </div>
        {paidFrom === 'personal' && (
          <p className="text-xs text-ink-muted">Counts as money you put into the business.</p>
        )}
      </div>

      {duplicate ? (
        <div className={`${note} flex flex-col gap-3 py-3`}>
          <p className="text-sm font-medium">Looks like you logged this already.</p>
          <div className="flex gap-2">
            <Button size="lg" className="flex-1" disabled={!ready || pending} onClick={() => save(true)}>
              {pending ? 'Saving…' : 'Save anyway'}
            </Button>
            <Button variant="ghost" size="lg" onClick={onCancel} disabled={pending}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button size="lg" className="flex-1" disabled={!ready || pending} onClick={() => save()}>
            {pending ? 'Saving…' : 'Log this bill'}
          </Button>
          <Button variant="ghost" size="lg" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  )
}
