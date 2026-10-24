'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { Camera, CheckCircle2, IndianRupee, Keyboard, Loader2, MessageCircle, Mic, Square } from 'lucide-react'

// How it works: the real screens, animated live. One clock drives the phone and the steps
// beside it, so the step that's lit is always the one playing. Click a step to jump to it.

const T = 12

const STEPS = [
  {
    title: 'Say it',
    body: 'Tap the mic and say who it’s for, what it’s for and how much. In any of the four languages.',
    from: 0,
    still: 2.4,
  },
  {
    title: 'Check it',
    body: 'The invoice fills itself in, GST split and all. Fix anything before it’s saved.',
    from: 3.2,
    still: 5,
  },
  {
    title: 'Send it',
    body: 'It gets its own link with a UPI QR. One tap sends it to your customer on WhatsApp.',
    from: 6,
    still: 8,
  },
  {
    title: 'Get paid',
    body: 'They pay by UPI, straight to your account. Mark it paid and your books update.',
    from: 8.9,
    still: 10,
  },
]
const until = (i: number) => STEPS[i + 1]?.from ?? T

const WORDS = 'Invoice Acme ₹40,000 for party catering, 5% GST, due in 7 days'.split(' ')

// The stage is drawn at 600×720 and scaled to fit. Screens inside the phone are laid out at
// the app's real 360px width, then scaled into the 276px screen.
const STAGE_W = 600
const SCREEN = 276 / 360

const clamp = (x: number) => Math.max(0, Math.min(1, x))
const out3 = (x: number) => 1 - Math.pow(1 - x, 3)
const inOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
// 0 → 1 over [a, a + d], eased.
const up = (t: number, a: number, d: number) => out3(clamp((t - a) / d))
// Shown between a and b, fading for f at each end.
const win = (t: number, a: number, b: number, f = 0.25) => Math.min(up(t, a, f), 1 - inOut(clamp((t - b) / f)))
// A quick tap: 1 → 0.96 → 1.
const press = (t: number, a: number, d = 0.18) => 1 - 0.04 * Math.sin(Math.PI * clamp((t - a) / d))

type Els = Record<string, HTMLElement> & { words: HTMLElement[]; fields: HTMLElement[]; pills: HTMLElement[]; steps: HTMLElement[] }

function collect(root: HTMLElement): Els {
  const all = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)]
  return {
    ...Object.fromEntries(all('[data-k]').map((e) => [e.dataset.k!, e])),
    words: all('[data-w]'),
    fields: all('[data-s]'),
    pills: all('[data-pill]'),
    steps: all('[data-step]'),
  } as Els
}

function screen(el: HTMLElement, o: number, y: number) {
  el.style.opacity = String(o)
  el.style.transform = `translateY(${y}px) scale(${SCREEN})`
  el.style.visibility = o < 0.001 ? 'hidden' : 'visible'
}

function render(e: Els, t: number) {
  // Steps: the lit one, and how far through it we are.
  const active = STEPS.filter((s) => t >= s.from).length - 1
  e.steps.forEach((li, i) => {
    li.dataset.active = String(i === active)
    const bar = li.querySelector<HTMLElement>('[data-bar]')!
    const done = i === active ? clamp((t - STEPS[i].from) / (until(i) - STEPS[i].from)) : i < active ? 1 : 0
    bar.style.scale = `${done} 1`
  })
  e.pills.forEach((p, i) => {
    let o = win(t, STEPS[i].from, until(i), 0.2)
    if (i === 0) o = Math.max(o, up(t, T - 0.2, 0.2))
    p.style.setProperty('--on', String(o))
    p.dataset.on = String(o > 0.5)
  })

  // Say it. Home restarts its own clock before it fades back in for the loop.
  const a = t > 11 ? 0 : t
  screen(e.home, t < 11 ? 1 - up(t, 3.2, 0.25) : up(t, 11.5, 0.45), t < 11 ? -10 * up(t, 3.2, 0.25) : 0)
  const rec = up(a, 0.7, 0.18) * (1 - up(a, 2.65, 0.15))
  e.red.style.opacity = String(rec)
  e.mic.style.transform = `scale(${press(a, 0.6) * press(a, 2.5)})`
  const pulse = (a * 1.2) % 1
  e.ring.style.boxShadow = `0 0 0 ${18 * pulse * rec}px rgb(255 255 255 / ${0.35 * (1 - pulse) * rec})`
  e.icMic.style.opacity = String(1 - rec)
  e.icStop.style.opacity = String(rec)
  e.label.textContent = rec > 0.5 ? 'Listening. Tap when you’re done' : 'Say an invoice'
  e.hint.style.opacity = String(1 - rec)
  e.heard.style.opacity = String(rec)
  e.words.forEach((w, i) => {
    const o = up(a, 0.9 + i * 0.13, 0.18)
    w.style.opacity = String(o)
    w.style.transform = `translateY(${4 * (1 - o)}px)`
  })
  e.loader.style.opacity = String(win(a, 2.75, 3.3, 0.15))
  e.spin.style.transform = `rotate(${a * 400}deg)`

  // Check it.
  screen(e.check, win(t, 3.3, 5.85, 0.3), t < 4.5 ? 16 * (1 - up(t, 3.3, 0.35)) : -12 * up(t, 5.85, 0.3))
  e.fields.forEach((f, i) => {
    const o = up(t, 3.45 + i * 0.14, 0.28)
    f.style.opacity = String(o)
    f.style.transform = `translateY(${8 * (1 - o)}px)`
  })
  const focus = win(t, 3.95, 4.9, 0.2)
  e.amount.style.borderColor = focus > 0.5 ? 'rgb(var(--brand-500))' : ''
  e.amount.style.boxShadow = `0 0 0 ${3 * focus}px rgb(var(--brand-500) / 0.35)`
  e.save.style.transform = `scale(${press(t, 5.45)})`

  // Send it, get paid.
  screen(e.invoice, win(t, 6, 11.4, 0.35), t < 9 ? 16 * (1 - up(t, 6, 0.4)) : -10 * up(t, 11.4, 0.35))
  e.wa.style.transform = `scale(${press(t, 6.85)})`
  const b = win(t, 7.1, 10.7, 0.3)
  e.bubble.style.opacity = String(b)
  e.bubble.style.transform = `translateY(${12 * (1 - b)}px) scale(${0.92 + 0.08 * b})`
  const paid = up(t, 9.25, 0.35)
  e.unpaid.style.opacity = String(1 - paid)
  e.paid.style.opacity = String(paid)
  e.paid.style.transform = `scale(${0.94 + 0.06 * paid})`
  const n = win(t, 8.95, 10.9, 0.3)
  e.notif.style.opacity = String(n)
  e.notif.style.transform = `translateY(${-14 * (1 - n)}px)`
}

export function HowItWorks({ qr }: { qr: string }) {
  const root = useRef<HTMLDivElement>(null)
  const seek = useRef<(i: number) => void>(() => {})

  useEffect(() => {
    const el = root.current!
    const e = collect(el)
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    let t = 0
    let last = performance.now()
    let visible = true
    let raf = 0

    seek.current = (i) => {
      t = reduce ? STEPS[i].still : STEPS[i].from
      render(e, t)
    }

    const frame = (now: number) => {
      if (visible) {
        t = (t + Math.min(now - last, 100) / 1000) % T
        render(e, t)
      }
      last = now
      raf = requestAnimationFrame(frame)
    }
    if (reduce) seek.current(0)
    else raf = requestAnimationFrame(frame)

    // Pause off-screen, and keep the stage scaled to its box.
    const io = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting))
    io.observe(e.frame)
    const ro = new ResizeObserver(([entry]) => {
      e.stage.style.transform = `scale(${entry.contentRect.width / STAGE_W})`
      e.stage.style.visibility = 'visible'
    })
    ro.observe(e.frame)

    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
    }
  }, [])

  return (
    <section ref={root} className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
      <div className="flex flex-col gap-6 md:order-2">
        <div className="flex flex-col gap-2">
          <p className="kicker">How it works</p>
          <h2 className="text-3xl font-semibold md:text-4xl">From one sentence to a paid invoice.</h2>
        </div>
        <ol className="flex flex-col gap-2">
          {STEPS.map((s, i) => (
            <li key={s.title} data-step data-active={i === 0}>
              <button
                type="button"
                onClick={() => seek.current(i)}
                className="group flex w-full gap-4 rounded-2xl p-3 text-left transition-[background-color,box-shadow,scale] duration-state ease-ambient hover:bg-muted active:scale-[0.99] in-data-[active=true]:bg-surface in-data-[active=true]:shadow-card"
              >
                <span className="amount flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700 transition-colors duration-state ease-ambient dark:bg-brand-100 in-data-[active=true]:bg-primary in-data-[active=true]:text-primary-foreground dark:in-data-[active=true]:bg-primary">
                  {i + 1}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-semibold text-ink-muted transition-colors duration-state ease-ambient in-data-[active=true]:text-ink">
                    {s.title}
                  </span>
                  <span className="leading-relaxed text-muted-foreground">{s.body}</span>
                  <span className="mt-1 h-0.5 overflow-hidden rounded-full bg-line">
                    <span data-bar className="block h-full origin-left scale-x-0 bg-primary" />
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div
        data-k="frame"
        role="img"
        aria-label="A phone: an invoice is said out loud, fills in, goes out on WhatsApp with a UPI QR, and gets marked paid"
        className="relative aspect-[5/6] overflow-hidden rounded-3xl border border-line bg-[radial-gradient(90%_70%_at_50%_55%,rgb(var(--brand-100)),rgb(var(--paper))_70%)] shadow-card md:order-1"
      >
        <div data-k="stage" aria-hidden className="invisible absolute top-0 left-0 h-[720px] w-[600px] origin-top-left">
          <Stage qr={qr} onPill={(i) => seek.current(i)} />
        </div>
      </div>
    </section>
  )
}

function Stage({ qr, onPill }: { qr: string; onPill: (i: number) => void }) {
  return (
    <>
      <div className="absolute inset-x-0 top-[26px] flex justify-center gap-2">
        {STEPS.map((s, i) => (
          <button
            key={s.title}
            type="button"
            tabIndex={-1}
            data-pill
            onClick={() => onPill(i)}
            className="group relative flex h-[34px] items-center gap-[7px] overflow-hidden rounded-full border border-line bg-surface pr-[14px] pl-[6px] text-sm font-semibold text-ink-muted [--on:0]"
          >
            <span className="absolute inset-0 bg-primary opacity-(--on)" />
            <span className="relative flex size-[22px] items-center justify-center rounded-full bg-brand-50 text-xs text-brand-700 dark:bg-brand-100 group-data-[on=true]:bg-white/20 group-data-[on=true]:text-primary-foreground">
              {i + 1}
            </span>
            <span className="relative group-data-[on=true]:text-primary-foreground">{s.title}</span>
          </button>
        ))}
      </div>

      <div className="absolute top-[84px] left-[152px] h-[616px] w-[296px] rounded-[46px] bg-[#1F2421] p-[10px] dark:bg-[#2B3036] shadow-[0_2px_3px_rgb(31_36_33/0.12),0_30px_60px_-20px_rgb(31_36_33/0.35)] ring-1 ring-white/10 ring-inset">
        <div className="relative h-[596px] w-[276px] overflow-hidden rounded-[36px] bg-paper">
          <div className="absolute top-[9px] left-1/2 z-20 h-[22px] w-[82px] -translate-x-1/2 rounded-full bg-[#1F2421]" />

          <div
            data-k="notif"
            className="absolute inset-x-[10px] top-[40px] z-10 flex items-center gap-2.5 rounded-[18px] bg-surface/95 px-3 py-2.5 text-xs opacity-0 shadow-card ring-1 ring-line"
          >
            <span className="flex size-[30px] items-center justify-center rounded-[9px] bg-primary text-primary-foreground">
              <IndianRupee className="size-4" />
            </span>
            <span className="flex flex-col">
              <b className="font-semibold">₹42,000 received</b>
              <span className="text-ink-secondary">UPI · from Acme Pvt Ltd</span>
            </span>
          </div>

          <Screen k="home">
            <header className="flex items-center gap-3">
              <span className="flex flex-col">
                <span className="font-semibold">Kaveri Caterers</span>
                <span className="text-xs text-muted-foreground">24 Oct 2026</span>
              </span>
            </header>
            <div
              data-k="mic"
              className="relative flex flex-col items-center gap-4 overflow-hidden rounded-3xl bg-brand-700 py-9 text-white shadow-lift dark:bg-brand-400"
            >
              <span data-k="red" className="absolute inset-0 bg-crit-600 opacity-0" />
              <span className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,rgb(255_255_255/0.18),transparent_60%)]" />
              <span data-k="ring" className="relative flex size-[76px] items-center justify-center rounded-full bg-white/15 ring-1 ring-white/25">
                <Mic data-k="icMic" className="size-8" />
                <Square data-k="icStop" className="absolute size-7 fill-current opacity-0" />
              </span>
              <span data-k="label" className="relative h-6 text-xl font-semibold tracking-tight">
                Say an invoice
              </span>
              <span className="relative block h-10 w-full px-8 text-center">
                <span data-k="hint" className="absolute inset-x-8 text-sm text-white/75">
                  “Invoice Acme ₹40,000 for party catering, 5% GST, due in 7 days”
                </span>
                <span data-k="heard" className="absolute inset-x-8 text-sm font-medium opacity-0">
                  {WORDS.map((w, i) => (
                    <span key={i} data-w className="mr-[0.26em] inline-block opacity-0">
                      {w}
                    </span>
                  ))}
                </span>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <span className="flex h-12 items-center justify-center gap-2 rounded-lg border border-input bg-surface font-medium">
                <Camera className="size-4" /> Snap a bill
              </span>
              <span className="flex h-12 items-center justify-center gap-2 rounded-lg border border-input bg-surface font-medium">
                <Keyboard className="size-4" /> Type it
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Who owes me" value="₹1,12,500" note="3 open invoices" />
              <Stat label="GST this month" value="₹8,640" note="To pay" />
            </div>
            <div data-k="loader" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-paper/90 opacity-0">
              <span className="flex size-14 items-center justify-center rounded-full bg-brand-50 text-brand-700 dark:bg-brand-100">
                <Loader2 data-k="spin" className="size-6" />
              </span>
              <p className="font-medium">Making your invoice…</p>
            </div>
          </Screen>

          <Screen k="check">
            <div className="card flex flex-col gap-3.5 p-[18px]">
              <div data-s className="flex flex-col gap-1.5">
                <span className="kicker">Check your invoice</span>
                <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-ink-secondary italic dark:bg-brand-100">
                  “Invoice Acme ₹40,000 for party catering, 5% GST, due in 7 days”
                </p>
              </div>
              <Field label="Customer">
                <span className="text-lg">Acme Pvt Ltd</span>
              </Field>
              <Field label="What for">
                Party catering <span className="ml-auto text-xs text-ink-muted">SAC 996334</span>
              </Field>
              <div data-s className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Amount</span>
                <span data-k="amount" className="amount flex h-14 items-center rounded-lg border border-input bg-surface px-3 text-2xl font-semibold">
                  <span className="mr-1.5 text-xl font-normal text-ink-muted">₹</span>40,000
                </span>
              </div>
              <div data-s className="grid grid-cols-2 gap-3">
                <Field label="GST rate" bare>
                  5%
                </Field>
                <Field label="Due" bare>
                  31 Oct 2026
                </Field>
              </div>
              <div data-s>
                <Totals />
              </div>
              <div data-s>
                <span
                  data-k="save"
                  className="flex h-12 items-center justify-center rounded-lg bg-primary font-semibold text-primary-foreground shadow-lift"
                >
                  Save and get link
                </span>
              </div>
            </div>
          </Screen>

          <Screen k="invoice">
            <div className="flex flex-col gap-2.5 rounded-2xl border border-brand-200 bg-brand-50 p-3.5 dark:bg-brand-100">
              <p className="font-semibold text-brand-900">Invoice ready. Send it.</p>
              <span data-k="wa" className="flex h-11 items-center justify-center gap-1.5 rounded-lg bg-[#25D366] text-sm font-medium text-white">
                <MessageCircle className="size-4" /> Send on WhatsApp
              </span>
            </div>
            <div className="card flex flex-col gap-3.5 overflow-hidden px-[18px] pb-[18px]">
              <div className="-mx-[18px] h-1.5 bg-primary" />
              <div className="flex items-start justify-between">
                <span className="flex flex-col">
                  <span className="font-semibold">Kaveri Caterers</span>
                  <span className="text-xs text-muted-foreground">Karnataka</span>
                </span>
                <span className="flex flex-col items-end">
                  <span className="kicker">Tax invoice</span>
                  <span className="font-mono text-xs">INV-2627-0007</span>
                </span>
              </div>
              <div className="flex items-start justify-between text-sm">
                <span className="flex flex-col">
                  <span className="kicker">Billed to</span>
                  <span className="font-medium">Acme Pvt Ltd</span>
                </span>
                <span className="flex flex-col items-end">
                  <span className="kicker">Due</span>
                  31 Oct 2026
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium">Total</span>
                <span className="amount text-3xl font-semibold">₹42,000</span>
              </div>
              <div className="relative h-[252px] rounded-xl border border-line bg-paper">
                <div data-k="unpaid" className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <div className="size-[136px] rounded-xl bg-white p-[9px] shadow-card [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: qr }} />
                  <span className="text-center text-[11px] text-muted-foreground">
                    Scan with any UPI app
                    <br />
                    <span className="font-mono">kaveri@okicici</span>
                  </span>
                </div>
                <div data-k="paid" className="absolute inset-0 flex items-center justify-center opacity-0">
                  <span className="flex items-center gap-2 rounded-xl bg-ok-50 px-5 py-3.5 text-lg font-semibold text-ok-700 dark:bg-ok-100">
                    <CheckCircle2 className="size-5" /> Paid. Thank you.
                  </span>
                </div>
              </div>
            </div>
          </Screen>
        </div>
      </div>

      <div
        data-k="bubble"
        className="absolute top-[452px] left-[22px] z-30 w-[252px] origin-[80%_100%] rounded-2xl bg-white px-2.5 pt-2.5 pb-2 text-[12.5px] leading-[1.4] opacity-0 shadow-[0_2px_4px_rgb(31_36_33/0.06),0_18px_40px_-12px_rgb(31_36_33/0.35)]"
      >
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-[#1DA851]">
          <MessageCircle className="size-3" /> WhatsApp · Acme Pvt Ltd
        </div>
        <div className="rounded-[10px_10px_2px_10px] bg-[#DCF8C6] px-2.5 py-2 text-[#111]">
          Hi Acme, here’s invoice INV-2627-0007 for ₹42,000, due 31 Oct. You can pay by UPI from the link.
          <div className="mt-1.5 rounded-md border-l-[3px] border-[#4B7630] bg-black/5 px-2 py-1">
            <b className="block text-[11.5px]">INV-2627-0007 from Kaveri Caterers · ₹42,000</b>
            <span className="text-[11px] text-[#555]">Tap to pay by UPI</span>
          </div>
          <div className="mt-0.5 text-right text-[10px] text-[#6b7b6b]">4:12 pm ✓✓</div>
        </div>
      </div>
    </>
  )
}

function Screen({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div
      data-k={k}
      className="absolute top-0 left-0 flex h-[777px] w-[360px] origin-top-left flex-col gap-4 px-4 pt-[50px] pb-4"
      style={{ transform: `scale(${SCREEN})`, opacity: k === 'home' ? 1 : 0 }}
    >
      {children}
    </div>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="card flex flex-col gap-1.5 p-3.5">
      <span className="kicker">{label}</span>
      <span className="amount text-[22px] font-semibold">{value}</span>
      <span className="text-xs text-muted-foreground">{note}</span>
    </div>
  )
}

function Field({ label, bare, children }: { label: string; bare?: boolean; children: ReactNode }) {
  return (
    <div {...(bare ? {} : { 'data-s': '' })} className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <span className="flex h-11 items-center rounded-lg border border-input bg-surface px-3">{children}</span>
    </div>
  )
}

function Totals() {
  return (
    <dl className="flex flex-col gap-1 rounded-xl border border-line bg-paper px-4 py-3.5 text-sm">
      {[
        ['Subtotal', '₹40,000'],
        ['CGST 2.5%', '₹1,000'],
        ['SGST 2.5%', '₹1,000'],
      ].map(([l, v]) => (
        <div key={l} className="flex justify-between text-muted-foreground">
          <dt>{l}</dt>
          <dd className="amount">{v}</dd>
        </div>
      ))}
      <div className="mt-1.5 flex items-baseline justify-between">
        <dt className="font-medium">Total</dt>
        <dd className="amount text-[28px] font-semibold">₹42,000</dd>
      </div>
    </dl>
  )
}
