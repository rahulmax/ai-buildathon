'use client'

import { Copy, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

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
      <Button
        variant="outline"
        className="h-11"
        onClick={() => navigator.clipboard.writeText(message).then(() => toast.success('Copied'))}
      >
        <Copy /> Copy
      </Button>
    </div>
  )
}
