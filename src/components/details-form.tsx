'use client'

import { useActionState } from 'react'
import { saveDetails } from '@/app/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { STATES } from '@/lib/gst'

export function DetailsForm() {
  const [state, action, pending] = useActionState(saveDetails, undefined)
  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Your name or business name</Label>
        <Input id="name" name="name" required autoComplete="organization" placeholder="Priya Design Studio" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="state">Your state</Label>
        <select id="state" name="state" required defaultValue="Karnataka" className="field">
          {STATES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="upi_id">UPI ID, so clients can pay you</Label>
        <Input id="upi_id" name="upi_id" required inputMode="email" autoCapitalize="none" placeholder="priya@okhdfcbank" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="gstin">
          GSTIN <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input id="gstin" name="gstin" autoCapitalize="characters" placeholder="29ABCDE1234F1Z5" />
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" size="lg" className="h-12 text-base" disabled={pending}>
        {pending ? 'Saving…' : 'Start'}
      </Button>
    </form>
  )
}
