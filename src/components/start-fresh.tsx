'use client'

import { useState } from 'react'
import { startFresh } from '@/app/auth-actions'
import { Button } from '@/components/ui/button'

// For a shared phone: this browser forgets the workspace and goes back to setup.
export function StartFresh({ saved }: { saved: boolean }) {
  const [asking, setAsking] = useState(false)

  return (
    <footer className="rise flex flex-col items-center gap-3 pt-2 text-sm">
      {asking ? (
        <form action={startFresh} className="card flex w-full flex-col gap-3 p-4">
          <p className="text-ink-secondary">
            {saved
              ? 'This browser will forget these books. Sign in with your email to get them back.'
              : 'This browser will forget these books. Without a saved email, you can’t get them back here.'}
          </p>
          <div className="flex gap-2">
            <Button type="submit" variant="destructive">
              Start fresh
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAsking(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAsking(true)}
          className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Not you? Start fresh
        </button>
      )}
    </footer>
  )
}
