'use client'

import { useState, useTransition } from 'react'
import { Ban } from 'lucide-react'
import { toast } from 'sonner'
import { cancelInvoice } from '@/app/actions'
import { Button } from '@/components/ui/button'

// Two taps: the first asks, the second cancels. Cancelling can't be undone.
export function CancelInvoice({ invoiceId }: { invoiceId: string }) {
  const [asking, setAsking] = useState(false)
  const [pending, start] = useTransition()

  if (!asking) {
    return (
      <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setAsking(true)}>
        <Ban /> Cancel invoice
      </Button>
    )
  }

  function cancel() {
    start(async () => {
      const res = await cancelInvoice(invoiceId)
      if (res.error) toast.error(res.error)
      else toast.success('Invoice cancelled')
      setAsking(false)
    })
  }

  return (
    <span className="flex flex-wrap items-center justify-end gap-1">
      <span className="text-xs text-muted-foreground">Cancel for good?</span>
      <Button variant="destructive" size="sm" disabled={pending} onClick={cancel}>
        {pending ? 'Cancelling…' : 'Yes, cancel it'}
      </Button>
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => setAsking(false)}>
        Keep it
      </Button>
    </span>
  )
}
