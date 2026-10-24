'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Keyboard, Loader2, Mic, Square } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { InvoiceConfirm } from '@/components/invoice-confirm'
import { BillConfirm } from '@/components/bill-confirm'
import type { BillExtract, InvoiceExtract } from '@/lib/schemas'
import type { WorkspaceService } from '@/lib/workspace'

type Stage =
  | { kind: 'idle' }
  | { kind: 'recording' }
  | { kind: 'typing' }
  | { kind: 'working'; label: string }
  | { kind: 'invoice'; extract: InvoiceExtract | null; transcript: string; language: string | null }
  | { kind: 'bill'; extract: BillExtract | null }

const pickMime = () =>
  ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t))

// Phones take 4000px photos. Shrink before upload; the model doesn't need more.
async function shrink(file: File): Promise<Blob> {
  const img = await createImageBitmap(file)
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.85))
}

export function Capture({ supplierState, services }: { supplierState: string; services: WorkspaceService[] }) {
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })
  const [typed, setTyped] = useState('')
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const photoInput = useRef<HTMLInputElement>(null)
  const router = useRouter()

  // 401: this browser lost its workspace (started fresh in another tab, or the cookie was cleared).
  function signedOut(res: Response) {
    if (res.status !== 401) return false
    toast.error('Your books aren’t open on this browser. Set up again, or sign in.')
    setStage({ kind: 'idle' })
    if (photoInput.current) photoInput.current.value = ''
    router.push('/start')
    return true
  }

  async function extract(transcript: string, language: string | null) {
    setStage({ kind: 'working', label: 'Making your invoice…' })
    const res = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ transcript }),
    })
    if (signedOut(res)) return
    const data = await res.json()
    if (!res.ok) toast.error(data.error)
    setStage({ kind: 'invoice', extract: res.ok ? data : null, transcript, language })
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = pickMime()
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunks.current = []
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const audio = new Blob(chunks.current, { type: rec.mimeType })
        setStage({ kind: 'working', label: 'Listening back…' })
        const form = new FormData()
        form.append('audio', audio)
        const res = await fetch('/api/transcribe', { method: 'POST', body: form })
        if (signedOut(res)) return
        const data = await res.json()
        if (!res.ok || !data.text) {
          toast.error(data.error ?? 'Didn’t catch that. Try again.')
          setStage({ kind: 'idle' })
          return
        }
        await extract(data.text, data.language)
      }
      rec.start()
      recorder.current = rec
      setStage({ kind: 'recording' })
    } catch {
      toast.error('Allow the microphone, or type the invoice instead.')
    }
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return
    setStage({ kind: 'working', label: 'Reading the bill…' })
    const form = new FormData()
    form.append('photo', await shrink(file), 'bill.jpg')
    const res = await fetch('/api/read-bill', { method: 'POST', body: form })
    if (signedOut(res)) return
    const data = await res.json()
    if (!res.ok) toast.error(data.error)
    setStage({ kind: 'bill', extract: res.ok ? data : null })
    if (photoInput.current) photoInput.current.value = ''
  }

  const reset = () => setStage({ kind: 'idle' })

  if (stage.kind === 'invoice') {
    return (
      <InvoiceConfirm
        extract={stage.extract}
        transcript={stage.transcript}
        language={stage.language}
        supplierState={supplierState}
        services={services}
        onCancel={reset}
      />
    )
  }
  if (stage.kind === 'bill') {
    return <BillConfirm extract={stage.extract} supplierState={supplierState} onCancel={reset} onSaved={reset} />
  }

  if (stage.kind === 'working') {
    return (
      <div className="card flex flex-col items-center gap-3 py-14 text-muted-foreground">
        <span className="flex size-14 items-center justify-center rounded-full bg-brand-50 text-brand-700 dark:bg-brand-100">
          <Loader2 className="size-6 animate-spin" />
        </span>
        <p className="font-medium text-ink">{stage.label}</p>
      </div>
    )
  }

  if (stage.kind === 'typing') {
    return (
      <div className="card flex flex-col gap-3 p-4">
        <Textarea
          autoFocus
          rows={4}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Invoice Acme ₹40,000 for landing page design, 18% GST, due in 7 days"
          className="text-base"
        />
        <div className="flex gap-2">
          <Button size="lg" className="flex-1" disabled={!typed.trim()} onClick={() => extract(typed.trim(), 'en')}>
            Make invoice
          </Button>
          <Button variant="ghost" size="lg" onClick={reset}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  const recording = stage.kind === 'recording'
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => (recording ? recorder.current?.stop() : startRecording())}
        className={`relative flex flex-col items-center gap-4 overflow-hidden rounded-3xl py-10 text-white shadow-lift transition-colors duration-state ease-ambient ${
          recording ? 'bg-crit-600' : 'bg-brand-700 hover:bg-brand-800 dark:bg-brand-400 dark:hover:bg-brand-300'
        }`}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,rgb(255_255_255/0.18),transparent_60%)]"
        />
        <span
          className={`relative flex size-20 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/25 ${
            recording ? 'recording' : ''
          }`}
        >
          {recording ? <Square className="size-7 fill-current" /> : <Mic className="size-8" />}
        </span>
        <span className="relative text-xl font-semibold tracking-tight">
          {recording ? 'Listening. Tap when you’re done' : 'Say an invoice'}
        </span>
        {!recording && (
          <span className="relative px-8 text-center text-sm text-white/75">
            “Invoice Acme ₹40,000 for landing page design, 18% GST, due in 7 days”
          </span>
        )}
      </button>
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" size="lg" onClick={() => photoInput.current?.click()} disabled={recording}>
          <Camera /> Snap a bill
        </Button>
        <Button variant="outline" size="lg" onClick={() => setStage({ kind: 'typing' })} disabled={recording}>
          <Keyboard /> Type it
        </Button>
      </div>
      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onPhoto(e.target.files?.[0])}
      />
    </div>
  )
}
