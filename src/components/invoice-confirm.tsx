'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { createInvoice } from '@/app/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { addDays, todayIST } from '@/lib/dates'
import { GST_RATES, STATES, totals } from '@/lib/gst'
import { formatINR, toPaise } from '@/lib/money'
import type { InvoiceExtract } from '@/lib/schemas'
import type { WorkspaceService } from '@/lib/workspace'

type Line = { description: string; quantity: string; rate: string; code: string }

const matchState = (s: string | null) =>
  s ? STATES.find((x) => x.toLowerCase() === s.trim().toLowerCase()) ?? null : null

export function InvoiceConfirm({
  extract,
  transcript,
  language,
  supplierState,
  services,
  onCancel,
}: {
  extract: InvoiceExtract | null
  transcript: string
  language: string | null
  supplierState: string
  services: WorkspaceService[]
  onCancel: () => void
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const today = todayIST()
  const spokenState = matchState(extract?.customer_state ?? null)
  const coded = services.filter((s) => s.code)
  // One service: every line is that service. Otherwise use the line Claude matched.
  const defaultCode = (n: number | null) =>
    (n != null ? services[n - 1]?.code : null) ?? (coded.length === 1 ? coded[0].code! : '')

  const [customer, setCustomer] = useState(extract?.customer_name ?? '')
  const [state, setState] = useState<string>(spokenState ?? supplierState)
  const [phone, setPhone] = useState('')
  const [gstRate, setGstRate] = useState<string>(extract?.gst_rate != null ? String(extract.gst_rate) : '')
  const [due, setDue] = useState(
    extract?.due_date ?? (extract?.due_in_days != null ? addDays(today, extract.due_in_days) : ''),
  )
  const [lines, setLines] = useState<Line[]>(
    extract?.lines.length
      ? extract.lines.map((l) => ({
          description: l.description,
          quantity: String(l.quantity || 1),
          rate: l.rate_rupees != null ? String(l.rate_rupees) : '',
          code: defaultCode(l.service_number),
        }))
      : [{ description: '', quantity: '1', rate: '', code: defaultCode(null) }],
  )

  const parsed = lines.map((l) => ({
    description: l.description.trim(),
    quantity: Number(l.quantity) || 0,
    rate: toPaise(Number(l.rate.replace(/,/g, '')) || 0),
    gstRate: Number(gstRate) || 0,
  }))
  const t = totals(parsed, supplierState, state)
  const ready =
    customer.trim() && gstRate !== '' && parsed.every((l) => l.description && l.quantity > 0 && l.rate > 0)

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, j) => (i === j ? { ...l, ...patch } : l)))

  function save() {
    start(async () => {
      try {
        const { slug } = await createInvoice({
          customer_name: customer.trim(),
          customer_state: state,
          customer_phone: phone.trim() || undefined,
          issue_date: today,
          due_date: due || '',
          lines: parsed.map((l, i) => ({
            description: l.description,
            quantity: l.quantity,
            rate: l.rate,
            gst_rate: l.gstRate,
            sac_hsn: lines[i].code || null,
          })),
          language: language ?? undefined,
          transcript,
        })
        router.push(`/i/${slug}?new=1`)
      } catch (e) {
        console.error(e)
        toast.error('Couldn’t save the invoice. Try again.')
      }
    })
  }

  return (
    <div className="flex flex-col gap-5 rounded-2xl border p-4">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Check your invoice</p>
        {transcript && <p className="text-sm text-muted-foreground italic">“{transcript}”</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="customer">Customer</Label>
        <Input id="customer" value={customer} onChange={(e) => setCustomer(e.target.value)} className="h-11 text-lg" />
      </div>

      {lines.map((l, i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor={`desc-${i}`}>{lines.length > 1 ? `Item ${i + 1}` : 'For'}</Label>
            {lines.length > 1 && (
              <Button variant="ghost" size="icon-sm" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                <Trash2 />
              </Button>
            )}
          </div>
          <Input id={`desc-${i}`} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
          <div className="grid grid-cols-[5rem_1fr] gap-2">
            <Input
              aria-label="Quantity"
              inputMode="decimal"
              value={l.quantity}
              onChange={(e) => setLine(i, { quantity: e.target.value })}
            />
            <div className="relative">
              <span className="absolute top-1/2 left-3 -translate-y-1/2 text-xl text-muted-foreground">₹</span>
              <Input
                aria-label="Rate in rupees"
                inputMode="decimal"
                value={l.rate}
                onChange={(e) => setLine(i, { rate: e.target.value })}
                className="amount h-14 pl-8 text-2xl md:text-2xl"
              />
            </div>
          </div>
          {coded.length > 0 && (
            <select
              aria-label="SAC or HSN code"
              value={l.code}
              onChange={(e) => setLine(i, { code: e.target.value })}
              className="field text-sm"
            >
              <option value="">No SAC/HSN code</option>
              {coded.map((s) => (
                <option key={s.name} value={s.code!}>
                  {s.kind === 'service' ? 'SAC' : 'HSN'} {s.code} · {s.name}
                </option>
              ))}
            </select>
          )}
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => setLines((ls) => [...ls, { description: '', quantity: '1', rate: '', code: defaultCode(null) }])}
      >
        <Plus /> Add an item
      </Button>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="gst">GST rate</Label>
          <select
            id="gst"
            value={gstRate}
            onChange={(e) => setGstRate(e.target.value)}
            className={`field ${gstRate === '' ? 'border-destructive' : ''}`}
          >
            <option value="" disabled>
              Pick one
            </option>
            {GST_RATES.map((r) => (
              <option key={r} value={r}>
                {r}%
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="due">Due</Label>
          <Input id="due" type="date" value={due} min={today} onChange={(e) => setDue(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="state">Customer’s state</Label>
        <select id="state" value={state} onChange={(e) => setState(e.target.value)} className="field">
          {STATES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        {!spokenState && (
          <p className="text-xs text-muted-foreground">Assumed same state as you, so CGST and SGST. Change it if not.</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="phone">
          Customer’s WhatsApp <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input id="phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" />
      </div>

      <dl className="flex flex-col gap-1 border-t pt-4 text-sm">
        <Row label="Subtotal" value={formatINR(t.subtotal)} />
        {t.cgst > 0 && <Row label={`CGST ${Number(gstRate) / 2}%`} value={formatINR(t.cgst)} />}
        {t.sgst > 0 && <Row label={`SGST ${Number(gstRate) / 2}%`} value={formatINR(t.sgst)} />}
        {t.igst > 0 && <Row label={`IGST ${gstRate}%`} value={formatINR(t.igst)} />}
        <div className="mt-2 flex items-baseline justify-between">
          <dt className="font-medium">Total</dt>
          <dd className="amount text-3xl font-semibold">{formatINR(t.total)}</dd>
        </div>
      </dl>

      <div className="flex gap-2">
        <Button className="h-12 flex-1 text-base" disabled={!ready || pending} onClick={save}>
          {pending ? 'Saving…' : 'Looks right, send it'}
        </Button>
        <Button variant="ghost" className="h-12" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <dt>{label}</dt>
      <dd className="amount">{value}</dd>
    </div>
  )
}
