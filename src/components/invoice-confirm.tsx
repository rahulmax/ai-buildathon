'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { createInvoice, loadInvoiceForm, type InvoiceFormData } from '@/app/actions'
import { DatePicker } from '@/components/date-picker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { closeCustomer, type CustomerOption } from '@/lib/customers'
import { addDays, DEFAULT_DUE_DAYS, todayIST } from '@/lib/dates'
import { GST_RATES, STATES, totals } from '@/lib/gst'
import { checkGstin } from '@/lib/gstin'
import { formatINR, toPaise } from '@/lib/money'
import type { InvoiceExtract } from '@/lib/schemas'
import type { WorkspaceService } from '@/lib/workspace'

type Line = { description: string; quantity: string; rate: string; code: string }

const matchState = (s: string | null) =>
  s ? STATES.find((x) => x.toLowerCase() === s.trim().toLowerCase()) ?? null : null

const gstinOf = (s: string) => {
  const value = s.replace(/\s/g, '').toUpperCase()
  return value ? { value, check: checkGstin(value) } : null
}

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
  const spokenGstin = gstinOf(extract?.customer_gstin ?? '')
  const coded = services.filter((s) => s.code)
  // One service: every line is that service. Otherwise use the line Claude matched.
  const defaultCode = (n: number | null) =>
    (n != null ? services[n - 1]?.code : null) ?? (coded.length === 1 ? coded[0].code! : '')

  // Can this workspace charge GST, and who are its customers. The server decides either way.
  const [ctx, setCtx] = useState<InvoiceFormData | null>(null)
  useEffect(() => {
    let live = true
    loadInvoiceForm()
      .then((d) => live && setCtx(d))
      .catch(() => live && setCtx({ registered: true, customers: [] }))
    return () => {
      live = false
    }
  }, [])

  const [customer, setCustomer] = useState(extract?.customer_name ?? '')
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<string[]>([])
  const [state, setState] = useState<string>(
    (spokenGstin?.check.ok ? spokenGstin.check.state : null) ?? spokenState ?? supplierState,
  )
  const [assumed, setAssumed] = useState(!spokenState && !spokenGstin?.check.ok)
  const [phone, setPhone] = useState(extract?.customer_phone ?? '')
  const [customerGstin, setCustomerGstin] = useState(spokenGstin?.value ?? '')
  const [gstRate, setGstRate] = useState<string>(extract?.gst_rate != null ? String(extract.gst_rate) : '')
  const [due, setDue] = useState(
    extract?.due_date ?? addDays(today, extract?.due_in_days ?? DEFAULT_DUE_DAYS),
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

  const registered = ctx?.registered
  const customers = ctx?.customers ?? []
  const chosen = customers.find((c) => c.id === customerId) ?? null
  const suggestion = chosen ? null : closeCustomer(customer, customers.filter((c) => !dismissed.includes(c.id)))
  const gstin = gstinOf(customerGstin)
  const gstinState = gstin?.check.ok ? gstin.check.state : null
  const gstinOwner = gstinState && !chosen ? customers.find((c) => c.gstin === gstin?.value) : undefined
  const placeOfSupply = gstinState ?? state

  const parsed = lines.map((l) => ({
    description: l.description.trim(),
    quantity: Number(l.quantity) || 0,
    rate: toPaise(Number(l.rate.replace(/,/g, '')) || 0),
    gstRate: registered ? Number(gstRate) || 0 : 0,
  }))
  const t = totals(parsed, supplierState, placeOfSupply)
  const ready =
    customer.trim() &&
    ctx &&
    (!registered || gstRate !== '') &&
    (!gstin || gstin.check.ok) &&
    parsed.every((l) => l.description && l.quantity > 0 && l.rate > 0)

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, j) => (i === j ? { ...l, ...patch } : l)))

  function onGstin(value: string) {
    setCustomerGstin(value)
    const g = gstinOf(value)
    if (g?.check.ok) setState(g.check.state)
  }

  // "Same as Acme Pvt Ltd?" Yes: use that customer, and fill what's still blank from it.
  function pickCustomer(c: CustomerOption) {
    setCustomerId(c.id)
    setCustomer(c.name)
    if (!phone.trim() && c.phone) setPhone(c.phone)
    const saved = c.gstin ? gstinOf(c.gstin) : null
    const savedState = matchState(c.state)
    if (!customerGstin.trim() && saved?.check.ok) {
      setCustomerGstin(saved.value)
      setState(saved.check.state)
    } else if (assumed && !gstinState && savedState) {
      setState(savedState)
      setAssumed(false)
    }
  }

  function newCustomer(c: CustomerOption) {
    setDismissed((d) => [...d, c.id])
    setCustomerId(null)
  }

  function save() {
    start(async () => {
      try {
        const res = await createInvoice({
          customer_name: customer.trim(),
          customer_state: placeOfSupply,
          customer_phone: phone.trim() || undefined,
          customer_gstin: gstin?.check.ok ? gstin.value : '',
          customer_id: customerId ?? undefined,
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
        if ('error' in res) {
          toast.error(res.error)
          return
        }
        router.push(`/i/${res.slug}?new=1`)
      } catch (e) {
        console.error(e)
        toast.error('Couldn’t save the invoice. Try again.')
      }
    })
  }

  return (
    <div className="card rise flex flex-col gap-5 p-5">
      <div className="flex flex-col gap-1">
        <p className="kicker">Check your invoice</p>
        {transcript && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-ink-secondary italic dark:bg-brand-100">“{transcript}”</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="customer">Customer</Label>
        <Input
          id="customer"
          value={customer}
          onChange={(e) => {
            setCustomer(e.target.value)
            setCustomerId(null)
          }}
          className="h-11 text-lg"
        />
        {suggestion && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-paper px-3 py-2 text-sm">
            <span className="min-w-0">
              Same as <span className="font-medium">{suggestion.name}</span>?
            </span>
            <div className="flex shrink-0 gap-1">
              <Button size="sm" variant="outline" onClick={() => pickCustomer(suggestion)}>
                Yes
              </Button>
              <Button size="sm" variant="ghost" onClick={() => newCustomer(suggestion)}>
                New customer
              </Button>
            </div>
          </div>
        )}
        {chosen && (
          <p className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>Goes on {chosen.name}’s account.</span>
            <button
              type="button"
              onClick={() => newCustomer(chosen)}
              className="underline-offset-4 hover:text-foreground hover:underline"
            >
              New customer
            </button>
          </p>
        )}
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
              className="amount h-14 text-center text-lg md:text-lg"
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
              className="field"
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
        className="-ml-2.5 self-start"
        onClick={() => setLines((ls) => [...ls, { description: '', quantity: '1', rate: '', code: defaultCode(null) }])}
      >
        <Plus /> Add an item
      </Button>

      <div className={`grid gap-3 ${registered ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {registered && (
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
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor="due">Due</Label>
          <DatePicker
            id="due"
            value={due}
            onChange={setDue}
            min={today}
            placeholder="No due date"
            clearable
            presets={[
              { label: '2 days', days: 2 },
              { label: '7 days', days: 7 },
              { label: '15 days', days: 15 },
              { label: '30 days', days: 30 },
            ]}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="gstin">
          Customer GSTIN <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="gstin"
          value={customerGstin}
          onChange={(e) => onGstin(e.target.value)}
          placeholder="29ABCDE1234F1Z5"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={gstin != null && !gstin.check.ok && gstin.value.length >= 15}
          className="font-mono uppercase"
        />
        {gstin && !gstin.check.ok && (
          <p className={`text-xs ${gstin.value.length >= 15 ? 'text-destructive' : 'text-muted-foreground'}`}>
            {gstin.value.length < 15
              ? 'A GSTIN has 15 characters.'
              : 'That GSTIN doesn’t look right. Check it with your customer.'}
          </p>
        )}
        {gstinState && (
          <p className="text-xs text-muted-foreground">
            Registered in {gstinState}, so that’s the place of supply.
            {gstinOwner && ` This GSTIN is ${gstinOwner.name}’s, so the invoice goes on their account.`}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="state">Customer’s state</Label>
        <select
          id="state"
          value={placeOfSupply}
          disabled={!!gstinState}
          onChange={(e) => {
            setState(e.target.value)
            setAssumed(false)
          }}
          className="field disabled:opacity-60"
        >
          {STATES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        {assumed && !gstinState && (
          <p className="text-xs text-muted-foreground">Assumed same state as you, so CGST and SGST. Change it if not.</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="phone">
          Customer’s WhatsApp <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input id="phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" />
      </div>

      {registered === false && (
        <p className="text-sm text-muted-foreground">
          You’re not registered for GST, so there’s no GST to add. We’ll send this as a bill of supply.
        </p>
      )}

      <dl className="flex flex-col gap-1 rounded-xl border border-line bg-paper p-4 text-sm">
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
        <Button size="lg" className="flex-1" disabled={!ready || pending} onClick={save}>
          {pending ? 'Sending…' : 'Send'}
        </Button>
        <Button variant="ghost" size="lg" onClick={onCancel} disabled={pending}>
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
