'use client'

import { useState, useTransition } from 'react'
import { Landmark, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { settlePineLabs } from '@/app/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatINR, rupeesString, toPaise } from '@/lib/money'

// Gateway money sits in Pine Labs until it pays out, less its fee. The test
// merchant may never settle, so the owner says what reached the bank.
export function Settle({ waiting, payments }: { waiting: number; payments: number }) {
  const [open, setOpen] = useState(false)
  const [rupees, setRupees] = useState(rupeesString(waiting))
  const [pending, start] = useTransition()
  const received = toPaise(Number(rupees) || 0)
  const fee = waiting - received
  const valid = received > 0 && fee >= 0

  const save = () =>
    start(async () => {
      const res = await settlePineLabs(received)
      if (res?.error) return void toast.error(res.error)
      toast.success(fee > 0 ? `Settled. ${formatINR(fee)} fee in expenses.` : 'Settled')
      setOpen(false)
    })

  return (
    <div className="card rise flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-2">
          <Landmark className="mt-0.5 size-4 text-muted-foreground" />
          <div className="flex flex-col">
            <span className="text-sm font-medium">Pine Labs: {formatINR(waiting)} waiting to settle</span>
            <span className="text-xs text-muted-foreground">
              {payments === 1 ? '1 payment' : `${payments} payments`}. Usually in your bank the next working day.
            </span>
          </div>
        </div>
        {!open && (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            Settled
          </Button>
        )}
      </div>
      {open && (
        <form
          className="rise flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (valid) save()
          }}
        >
          <Label htmlFor="received">Amount that reached your bank</Label>
          <div className="relative">
            <span className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">₹</span>
            <Input
              id="received"
              inputMode="decimal"
              value={rupees}
              onChange={(e) => setRupees(e.target.value)}
              className="amount pl-7"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {valid ? `Pine Labs fee ${formatINR(fee)}, booked as an expense.` : 'Can’t be more than what’s waiting.'}
          </p>
          <div className="flex gap-2">
            <Button type="submit" disabled={!valid || pending}>
              {pending && <Loader2 className="animate-spin" />}
              Save
            </Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
