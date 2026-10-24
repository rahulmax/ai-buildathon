'use client'

import { useActionState, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import type { ServiceCodes } from '@/app/api/codes/route'
import { saveDetails } from '@/app/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { STATES } from '@/lib/gst'
import { checkGstin } from '@/lib/gstin'
import type { Service } from '@/lib/schemas'

// Comma or new line separates items: "logo design, website design".
const splitItems = (s: string) =>
  s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 2)

export function DetailsForm() {
  const [result, action, pending] = useActionState(saveDetails, undefined)
  const [name, setName] = useState('')
  const [state, setState] = useState('Karnataka')
  const [upi, setUpi] = useState('')
  const [gstin, setGstin] = useState('')
  const [gstinTouched, setGstinTouched] = useState(false)
  const [sells, setSells] = useState('')
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
      setPicked(Object.fromEntries((data.items as ServiceCodes[]).map((c) => [c.service, c.options[0]?.code ?? ''])))
    } catch (e) {
      setLookupError(e instanceof Error && e.message ? e.message : 'Couldn’t look up codes right now. Try again.')
    } finally {
      setLooking(false)
    }
  }

  const services: Service[] = (codes ?? []).map((c) => {
    const option = c.options.find((o) => o.code === picked[c.service])
    return { name: c.service, kind: c.kind, code: option?.code ?? null, code_description: option?.desc ?? null }
  })

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Your name or business name</Label>
        <Input
          id="name"
          name="name"
          required
          autoComplete="organization"
          placeholder="Priya Design Studio"
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
          placeholder="priya@okhdfcbank"
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
          placeholder="Logo design, website development"
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
            {pending ? 'Saving…' : 'Start'}
          </Button>
          <Button type="button" variant="ghost" size="lg" onClick={() => setCodes(null)}>
            <X /> Change
          </Button>
        </div>
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
