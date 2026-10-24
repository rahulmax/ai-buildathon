'use client'

import { useState } from 'react'
import { Check, Copy, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// In-app browsers (WhatsApp, Instagram) and older iPhones have no clipboard API,
// or refuse it. Fall back to selecting a hidden textarea and the old copy command.
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    area.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  }
}

// The button says Copied itself, so it doesn't rely on the toast being seen.
export function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    if (!(await copyText(text))) return void toast.error('Couldn’t copy. Press and hold the message to copy it.')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <Button variant="outline" className={cn('h-11', className)} onClick={copy}>
      {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy'}
    </Button>
  )
}

export function Share({ text, phone, url }: { text: string; phone: string | null; url: string }) {
  const digits = phone?.replace(/\D/g, '') ?? ''
  const to = digits.length === 10 ? `91${digits}` : digits
  const message = text.replace('{link}', url)
  return (
    <div className="flex gap-2">
      <a
        href={`https://wa.me/${to}?text=${encodeURIComponent(message)}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#25D366] text-sm font-medium text-white"
      >
        <MessageCircle className="size-4" /> Send on WhatsApp
      </a>
      <CopyButton text={message} />
    </div>
  )
}
