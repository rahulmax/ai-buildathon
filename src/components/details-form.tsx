'use client'

import { useActionState, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import type { ServiceCodes } from '@/app/api/codes/route'
import { saveDetails, updateDetails } from '@/app/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { STATES } from '@/lib/gst'
import { checkGstin } from '@/lib/gstin'
import type { Service } from '@/lib/schemas'

// Comma or new line separates items: "lunch boxes, party catering".
const splitItems = (s: string) =>
  s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 2)

export type Details = { name: string; state: string; upi_id: string; gstin: string | null; services: Service[] }

// First visit with no `initial`; Settings passes the saved details to edit them.
export function DetailsForm({ initial }: { initial?: Details }) {
  const [result, action, pending] = useActionState(initial ? updateDetails : saveDetails, undefined)
  const initialSells = initial?.services.map((s) => s.name).join(', ') ?? ''
  const [name, setName] = useState(initial?.name ?? '')
  const [state, setState] = useState(initial?.state ?? 'Karnataka')
  const [upi, setUpi] = useState(initial?.upi_id ?? '')
  const [gstin, setGstin] = useState(initial?.gstin ?? '')
  const [gstinTouched, setGstinTouched] = useState(false)
  const [sells, setSells] = useState(initialSells)
  const [looking, setLooking] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [codes, setCodes] = useState<ServiceCodes[] | null>(null)
  const [picked, setPicked] = useState<Record<string, string>>({})

  const gstinCheck = gstin.trim() ? checkGstin(gstin, state) : null
  const gstinError = gstinCheck && !gstinCheck.ok && gstinTouched ? gstinCheck.error : null
  const items = splitItems(sells)
  const step1Ready = name.trim() && upi.trim() && items.length > 0 && (!gstinCheck || gstinCheck.ok)

  async function findCodes() {
    setGstinTouched(true)
    setLookupError(null)
    if (!name.trim()) return setLookupError('Add your name or business name.')
    if (!upi.trim()) return setLookupError('Add your UPI ID.')
    if (gstinCheck && !gstinCheck.ok) return
    if (!items.length) return setLookupError('Tell us at least one thing you sell.')
    setLooking(true)
    try {
      const res = await fetch('/api/codes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ services: items.slice(0, 10) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCodes(data.items)
      setPicked(
        Object.fromEntries(
          (data.items as ServiceCodes[]).map((c) => {
            // Keep a code picked before, if the lookup still offers it.
            const saved = initial?.services.find((s) => s.name.toLowerCase() === c.service.toLowerCase())?.code
            const keep = saved && c.options.some((o) => o.code === saved)
            return [c.service, keep ? saved : (c.options[0]?.code ?? '')]
          }),
        ),
      )
    } catch (e) {
      setLookupError(e instanceof Error && e.message ? e.message : 'Couldn’t look up codes right now. Try again.')
    } finally {
      setLooking(false)
    }
  }

  // In Settings, an untouched list keeps its saved codes; no lookup needed.
  const keepServices = Boolean(initial) && !codes && sells === initialSells
  const services: Service[] = codes
    ? codes.map((c) => {
        const option = c.options.find((o) => o.code === picked[c.service])
        return { name: c.service, kind: c.kind, code: option?.code ?? null, code_description: option?.desc ?? null }
      })
    : keepServices && initial
      ? initial.services
      : []
  const saveLabel = initial ? 'Save changes' : 'Start'

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Your name or business name</Label>
        <Input
          id="name"
          name="name"
          required
          autoComplete="organization"
          placeholder="Kaveri Caterers"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="state">Your state</Label>
        <select id="state" name="state" required value={state} onChange={(e) => setState(e.target.value)} className="field">
          {STATES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="upi_id">UPI ID, so clients can pay you</Label>
        <Input
          id="upi_id"
          name="upi_id"
          required
          inputMode="email"
          autoCapitalize="none"
          placeholder="kaveri@okicici"
          value={upi}
          onChange={(e) => setUpi(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="gstin">
          GSTIN <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="gstin"
          name="gstin"
          autoCapitalize="characters"
          placeholder="29ABCDE1234F1ZW"
          value={gstin}
          onChange={(e) => setGstin(e.target.value.toUpperCase())}
          onBlur={() => setGstinTouched(true)}
          aria-invalid={Boolean(gstinError)}
          className="font-mono"
        />
        {gstinError && <p className="text-sm text-destructive">{gstinError}</p>}
        {gstinCheck?.ok && <p className="text-xs text-ok-700">Valid GSTIN, registered in {gstinCheck.state}.</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="sells">What do you sell?</Label>
        <Input
          id="sells"
          placeholder="Office lunch boxes, party catering"
          value={sells}
          onChange={(e) => {
            setSells(e.target.value)
            setCodes(null)
          }}
        />
        <p className="text-xs text-muted-foreground">Separate with commas. We’ll find the GST code for each.</p>
      </div>

      {codes && (
        <div className="rise flex flex-col gap-4 rounded-xl border border-line bg-paper p-4">
          <p className="kicker">GST codes</p>
          {codes.map((c) => (
            <div key={c.service} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor={`code-${c.service}`}>{c.service}</Label>
                <span className="rounded-badge bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-800 dark:bg-brand-100">
                  {c.kind === 'service' ? 'SAC' : 'HSN'}
                </span>
              </div>
              <select
                id={`code-${c.service}`}
                value={picked[c.service] ?? ''}
                onChange={(e) => setPicked((p) => ({ ...p, [c.service]: e.target.value }))}
                className="field"
              >
                {c.options.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.code} · {o.desc.length > 70 ? `${o.desc.slice(0, 70)}…` : o.desc}
                  </option>
                ))}
                <option value="">I’ll add it later</option>
              </select>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">From the official GST HSN/SAC list. These go on your invoices.</p>
        </div>
      )}

      <input type="hidden" name="services" value={JSON.stringify(services)} />
      {(lookupError || result?.error) && <p className="text-sm text-destructive">{lookupError ?? result?.error}</p>}

      {codes ? (
        <div className="flex gap-2">
          <Button type="submit" size="lg" className="flex-1" disabled={pending || !step1Ready}>
            {pending ? 'Saving…' : saveLabel}
          </Button>
          <Button type="button" variant="ghost" size="lg" onClick={() => setCodes(null)}>
            <X /> Change
          </Button>
        </div>
      ) : keepServices ? (
        <Button type="submit" size="lg" disabled={pending || !step1Ready}>
          {pending ? 'Saving…' : saveLabel}
        </Button>
      ) : (
        <Button type="button" size="lg" disabled={looking} onClick={findCodes}>
          {looking ? (
            <>
              <Loader2 className="animate-spin" /> Finding GST codes…
            </>
          ) : (
            'Next'
          )}
        </Button>
      )}
    </form>
  )
}
