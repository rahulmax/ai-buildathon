'use client'

import { useActionState, useState } from 'react'
import { Loader2, MailCheck } from 'lucide-react'
import { requestSignIn } from '@/app/auth-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function SignInForm() {
  const [state, action, pending] = useActionState(requestSignIn, undefined)
  const [email, setEmail] = useState('')

  if (state?.sent) {
    return (
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 dark:bg-brand-100">
          <MailCheck className="size-4" />
        </span>
        <div className="flex flex-col gap-0.5">
          <p className="font-medium">If that email has books, a link is on its way.</p>
          <p className="text-sm text-muted-foreground">It expires in 30 minutes. Check spam if you don’t see it.</p>
        </div>
      </div>
    )
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Your email</Label>
        <Input
          id="email"
          type="email"
          name="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" size="lg" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        Send me a link
      </Button>
    </form>
  )
}
