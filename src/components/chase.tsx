'use client'

import { useState, useTransition } from 'react'
import { Bot, Copy, Loader2, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { markPaid, paymentChoices } from '@/app/actions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { formatINR } from '@/lib/money'

type Draft = {
  message: string
  phone: string | null
  source: 'agenticorg' | 'claude'
  gateway: boolean
  agent: { runId: string | null; tone: string | null; toolCalls: string[] } | null
}

type Choices = { total: number; tds: number; lessTds: number }

const waLink = (phone: string | null, text: string) => {
  const digits = phone?.replace(/\D/g, '') ?? ''
  const to = digits.length === 10 ? `91${digits}` : digits
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`
}

// The collections agent drafts; the person approves before anything goes out.
export function Chase({ invoiceId }: { invoiceId: string }) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [choices, setChoices] = useState<Choices | null>(null)
  const [paying, startPaying] = useTransition()

  async function chase() {
    setLoading(true)
    const res = await fetch('/api/chase', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ invoiceId }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) return toast.error(data.error ?? 'Couldn’t write the reminder. Try again.')
    setDraft(data)
    setMessage(data.message)
  }

  const askHow = () =>
    startPaying(async () => {
      const c = await paymentChoices(invoiceId)
      if (!c) return void toast.error('This invoice isn’t open any more.')
      setChoices(c)
    })

  const pay = (lessTds: boolean) =>
    startPaying(async () => {
      await markPaid(invoiceId, { lessTds })
      toast.success(lessTds ? 'Marked as paid, TDS noted' : 'Marked as paid')
    })

  return (
    <div className="flex flex-col gap-3">
      {!draft && !choices && (
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={chase} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <Bot />}
            {loading ? 'Writing reminder…' : 'Send reminder'}
          </Button>
          <Button variant="ghost" disabled={paying} onClick={askHow}>
            {paying && <Loader2 className="animate-spin" />}
            Mark as paid
          </Button>
        </div>
      )}
      {choices && (
        <div className="rise flex flex-col gap-2 rounded-xl border border-line bg-paper p-3">
          <p className="text-xs text-muted-foreground">How did they pay?</p>
          <Button
            variant="outline"
            className="h-auto flex-col items-start gap-0.5 py-3 text-left whitespace-normal"
            disabled={paying}
            onClick={() => pay(false)}
          >
            <span className="font-semibold">Paid in full</span>
            <span className="text-xs font-normal text-muted-foreground">You got {formatINR(choices.total)}</span>
          </Button>
          <Button
            variant="outline"
            className="h-auto flex-col items-start gap-0.5 py-3 text-left whitespace-normal"
            disabled={paying}
            onClick={() => pay(true)}
          >
            <span className="font-semibold">Paid less 10% TDS</span>
            <span className="text-xs font-normal text-muted-foreground">
              You got {formatINR(choices.lessTds)}, {formatINR(choices.tds)} TDS kept by client
            </span>
          </Button>
          <Button variant="ghost" size="sm" className="self-start" disabled={paying} onClick={() => setChoices(null)}>
            Cancel
          </Button>
        </div>
      )}
      {draft && (
        <div className="rise flex flex-col gap-3 rounded-xl border border-line bg-paper p-3">
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <Bot className="size-3.5" />
            {draft.source === 'agenticorg' ? 'Collections agent on AgenticOrg' : 'Drafted by Claude'}
            {draft.agent?.tone && <span>· {draft.agent.tone}</span>}
            {draft.gateway && <span>· Pine Labs pay link</span>}
            {draft.agent?.toolCalls.length ? <span>· {draft.agent.toolCalls.join(', ')}</span> : null}
          </p>
          <Textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} className="text-sm" />
          <p className="text-xs text-muted-foreground">Nothing is sent until you tap send.</p>
          <div className="flex gap-2">
            <a
              href={waLink(draft.phone, message)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#25D366] text-sm font-medium text-white"
            >
              <MessageCircle className="size-4" /> Send on WhatsApp
            </a>
            <Button
              variant="outline"
              className="h-10"
              onClick={() => navigator.clipboard.writeText(message).then(() => toast.success('Copied'))}
            >
              <Copy /> Copy
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
