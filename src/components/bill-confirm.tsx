'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { createBill } from '@/app/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { todayIST } from '@/lib/dates'
import { isGstin } from '@/lib/gst'
import { formatINR, toPaise } from '@/lib/money'
import { BILL_CATEGORIES, type BillExtract } from '@/lib/schemas'

const str = (n: number | null | undefined) => (n != null ? String(n) : '')
const paise = (s: string) => toPaise(Number(s.replace(/,/g, '')) || 0)

export function BillConfirm({
  extract,
  onCancel,
  onSaved,
}: {
  extract: BillExtract | null
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

  const claimable = gstin.trim() !== '' && isGstin(gstin)
  const gst = paise(cgst) + paise(sgst) + paise(igst)
  const ready = seller.trim() && paise(total) > 0 && gst < paise(total)

  function save() {
    start(async () => {
      try {
        await createBill({
          seller_name: seller.trim(),
          seller_gstin: gstin.trim(),
          bill_date: date,
          category: category as (typeof BILL_CATEGORIES)[number],
          subtotal: paise(total) - gst,
          cgst: paise(cgst),
          sgst: paise(sgst),
          igst: paise(igst),
          total: paise(total),
        })
        toast.success(claimable ? `Logged. ${formatINR(gst)} GST to claim back.` : 'Logged as an expense.')
        onSaved()
      } catch (e) {
        console.error(e)
        toast.error('Couldn’t save the bill. Try again.')
      }
    })
  }

  return (
    <div className="flex flex-col gap-5 rounded-2xl border p-4">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Check your bill</p>

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

      <div className="flex flex-col gap-2">
        <Label htmlFor="gstin">Seller’s GSTIN</Label>
        <Input
          id="gstin"
          autoCapitalize="characters"
          value={gstin}
          onChange={(e) => setGstin(e.target.value.toUpperCase())}
          className="font-mono"
        />
        {gst > 0 && !claimable && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            No GSTIN on this bill, so its GST can’t be claimed. The whole amount goes to expenses.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="date">Date</Label>
          <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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

      <div className="flex gap-2">
        <Button className="h-12 flex-1 text-base" disabled={!ready || pending} onClick={save}>
          {pending ? 'Saving…' : 'Log this bill'}
        </Button>
        <Button variant="ghost" className="h-12" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
