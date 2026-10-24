'use client'

import { useActionState, useState } from 'react'
import { Loader2, MailCheck, X } from 'lucide-react'
import { saveEmail, skipSaveEmail } from '@/app/auth-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function SaveEmailCard() {
  const [state, action, pending] = useActionState(saveEmail, undefined)
  const [email, setEmail] = useState('')

  if (state?.sent) {
    return (
      <div className="card flex items-start gap-3 p-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 dark:bg-brand-100">
          <MailCheck className="size-4" />
        </span>
        <div className="flex flex-col gap-0.5">
          <p className="font-medium">Check your email</p>
          <p className="text-sm text-muted-foreground">
            Tap the link we sent to {email} to keep your books. It expires in 30 minutes.
          </p>
        </div>
      </div>
    )
  }

  return (
    <form action={action} className="card flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <p className="font-semibold">Keep your books? Add your email.</p>
          <p className="text-sm text-muted-foreground">
            We’ll send a link. Use it to open your books on any phone. No password.
          </p>
        </div>
        <Button
          type="submit"
          formAction={skipSaveEmail}
          formNoValidate
          variant="ghost"
          size="icon-sm"
          aria-label="Not now"
          className="-mt-1 -mr-1 text-ink-muted"
        >
          <X />
        </Button>
      </div>
      <div className="flex gap-2">
        <Input
          type="email"
          name="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          aria-label="Your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit" size="lg" className="h-11" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : 'Send link'}
        </Button>
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  )
}
