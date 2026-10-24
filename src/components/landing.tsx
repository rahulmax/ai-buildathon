import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowRight, Camera, Mic } from 'lucide-react'
import { HowItWorks } from '@/components/explainer'
import { Mark } from '@/components/mark'
import { buttonVariants } from '@/components/ui/button'
import { emailEnabled } from '@/lib/email'
import { formatINR } from '@/lib/money'
import { qrSvg, upiLink } from '@/lib/upi'

// What a first-time visitor sees at `/`. Images are generated on-brand with Higgsfield.

const LANGUAGES = [
  { label: 'English', lang: 'en' },
  { label: 'हिन्दी', lang: 'hi' },
  { label: 'ಕನ್ನಡ', lang: 'kn' },
  { label: 'മലയാളം', lang: 'ml' },
]

function Start({ className = '' }: { className?: string }) {
  return (
    <Link href="/start" className={buttonVariants({ size: 'lg', className: `shadow-lift ${className}` })}>
      Make your first invoice
      <ArrowRight
        data-icon="inline-end"
        className="transition-transform duration-state ease-ambient group-hover/button:translate-x-0.5"
      />
    </Link>
  )
}

// The demo sentence, and the invoice it becomes. 18% GST in-state splits into CGST and SGST.
function SpokenInvoice() {
  const subtotal = 40_000_00
  const half = subtotal * 0.09
  return (
    <div className="card flex w-full max-w-xs flex-col gap-3 p-4">
      <div className="flex items-start gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 dark:bg-brand-100">
          <Mic className="size-3.5" />
        </span>
        <p className="text-sm leading-snug text-ink-secondary">
          &ldquo;Invoice Acme ₹40,000 for landing page design, 18% GST, due in 7&nbsp;days.&rdquo;
        </p>
      </div>
      <div className="flex flex-col gap-1.5 border-t border-line pt-3 text-sm">
        <div className="flex items-baseline justify-between">
          <span className="font-semibold">Acme</span>
          <span className="text-xs text-ink-muted">Due 31 Oct</span>
        </div>
        <Row label="Landing page design" value={formatINR(subtotal)} />
        <Row label="CGST 9%" value={formatINR(half)} muted />
        <Row label="SGST 9%" value={formatINR(half)} muted />
        <div className="mt-1 flex items-baseline justify-between border-t border-line pt-2">
          <span className="font-medium">Total</span>
          <span className="amount text-lg font-semibold">{formatINR(subtotal + 2 * half)}</span>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between ${muted ? 'text-ink-muted' : ''}`}>
      <span>{label}</span>
      <span className="amount">{value}</span>
    </div>
  )
}

function Way({
  src,
  alt,
  icon,
  kicker,
  title,
  children,
}: {
  src: string
  alt: string
  icon: ReactNode
  kicker: string
  title: string
  children: ReactNode
}) {
  return (
    <article className="card flex flex-col overflow-hidden">
      <div className="relative aspect-[4/3] bg-muted">
        <Image src={src} alt={alt} fill sizes="(min-width: 768px) 50vw, 100vw" className="settle object-cover" />
      </div>
      <div className="flex flex-col gap-2 p-6">
        <span className="kicker flex items-center gap-1.5 text-brand-700">
          {icon}
          {kicker}
        </span>
        <h3 className="text-2xl font-semibold">{title}</h3>
        <p className="leading-relaxed text-muted-foreground">{children}</p>
      </div>
    </article>
  )
}

export async function Landing() {
  // A real, scannable QR for the demo invoice in the How it works phone.
  const qr = await qrSvg(upiLink({ upiId: 'riya.design@okaxis', payee: 'Riya Design Studio', amount: 47_200_00, note: 'INV-2627-0007' }))
  return (
    <div className="flex flex-1 flex-col overflow-clip">
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-24 px-4 pt-5 pb-10 md:gap-32 md:px-8">
        <header className="rise relative z-10 flex items-center justify-between">
          <Mark />
          <Link href="/start" className={buttonVariants({ variant: 'ghost' })}>
            Start
          </Link>
        </header>

        <section className="wash wash-hero stagger grid items-center gap-12 md:grid-cols-[1.1fr_1fr] md:gap-16">
          <div className="flex flex-col gap-6">
            <p className="kicker rise">For freelancers and small sellers</p>
            <h1 className="rise rise-blur text-5xl leading-[1.02] font-semibold md:text-7xl">Say it, get&nbsp;paid.</h1>
            <p className="rise max-w-lg text-lg leading-relaxed text-muted-foreground">
              Say an invoice out loud. Get a GST invoice with a UPI QR, and a reminder ready to send on WhatsApp.
            </p>
            <div className="rise flex flex-col items-start gap-3">
              <Start />
              <p className="text-sm text-ink-muted">No sign-up. Your first invoice takes a minute.</p>
              {emailEnabled() && (
                <Link href="/signin" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                  Have books already? Sign in
                </Link>
              )}
            </div>
          </div>
          <div className="rise relative pb-16 md:pb-0">
            <div className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-muted shadow-card">
              <Image
                src="/landing/hero-speak.jpg"
                alt="A freelancer at her desk saying an invoice into her phone"
                fill
                loading="eager"
                fetchPriority="high"
                sizes="(min-width: 768px) 45vw, 100vw"
                className="object-cover"
              />
            </div>
            <div className="rise rise-late absolute right-4 bottom-0 left-4 flex justify-start md:right-auto md:-bottom-10 md:-left-12">
              <SpokenInvoice />
            </div>
          </div>
        </section>

        <div className="wash wash-band reveal">
          <HowItWorks qr={qr} />
        </div>

        <section className="wash wash-lang flex flex-col items-center gap-5 text-center">
          <h2 className="reveal text-2xl font-semibold md:text-3xl">Bill in the language you think in.</h2>
          <ul className="reveal-group flex flex-wrap justify-center gap-2">
            {LANGUAGES.map((l) => (
              <li key={l.lang} lang={l.lang} className="rounded-full border border-line bg-surface px-4 py-2 text-lg">
                {l.label}
              </li>
            ))}
          </ul>
          <p className="reveal max-w-md text-muted-foreground">
            Rupee amounts, customer names and GST rates come through in all four. Every field is yours to check before
            anything is saved.
          </p>
        </section>

        <section className="flex flex-col gap-8">
          <div className="reveal flex flex-col gap-2">
            <p className="kicker">Two ways in</p>
            <h2 className="text-3xl font-semibold md:text-4xl">Money in, money out.</h2>
          </div>
          <div className="reveal-group grid gap-6 md:grid-cols-2">
            <Way
              src="/landing/say.jpg"
              alt="A developer saying an invoice into his phone by a window"
              icon={<Mic className="size-3.5" />}
              kicker="Money in"
              title="Say an invoice."
            >
              Customer, lines, GST rate and due date, filled in from what you said. Fix anything, then send it. Each
              invoice gets its own link with a UPI QR.
            </Way>
            <Way
              src="/landing/snap.jpg"
              alt="A shopkeeper photographing a paper bill on his counter"
              icon={<Camera className="size-3.5" />}
              kicker="Money out"
              title="Snap a bill."
            >
              Photograph any bill or receipt. The seller, their GSTIN, the amount and the GST you paid are logged as an
              expense. We keep the numbers, not the photo.
            </Way>
          </div>
        </section>

        <section className="wash wash-books grid items-center gap-10 md:grid-cols-2 md:gap-16">
          <div className="reveal relative aspect-[3/2] overflow-hidden rounded-3xl bg-muted shadow-card">
            <Image
              src="/landing/books.jpg"
              alt="Receipts, a green ledger and a coffee, neatly on a desk"
              fill
              sizes="(min-width: 768px) 50vw, 100vw"
              className="settle object-cover"
            />
          </div>
          <div className="reveal-group flex flex-col gap-5">
            <p className="kicker">The books</p>
            <h2 className="text-3xl font-semibold md:text-4xl">Your books keep themselves.</h2>
            <p className="leading-relaxed text-muted-foreground">
              Every invoice and bill is recorded in double-entry books underneath. You only see two things.
            </p>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="card flex flex-col gap-1 p-4">
                <dt className="kicker">Who owes me</dt>
                <dd className="text-sm text-muted-foreground">Open invoices, oldest first, with the total on top.</dd>
              </div>
              <div className="card flex flex-col gap-1 p-4">
                <dt className="kicker">GST this month</dt>
                <dd className="text-sm text-muted-foreground">
                  GST you collected, minus GST you paid. Split into CGST, SGST and IGST.
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <div className="wash wash-cta reveal">
          <section className="relative overflow-hidden rounded-3xl border border-line bg-surface md:min-h-[26rem]">
            <div className="relative aspect-[3/2] md:absolute md:inset-0 md:aspect-auto">
              <Image src="/landing/wall.jpg" alt="" fill sizes="100vw" className="settle object-cover object-left" />
            </div>
            <div className="relative flex flex-col items-start gap-4 p-6 md:absolute md:top-1/2 md:right-12 md:max-w-sm md:-translate-y-1/2 md:rounded-2xl md:bg-surface md:p-8 md:shadow-card">
              <h2 className="text-3xl font-semibold">Send your first invoice today.</h2>
              <p className="leading-relaxed text-muted-foreground">
                Open it on your phone, say who to bill, and share the link. That&rsquo;s the whole setup.
              </p>
              <Start />
            </div>
          </section>
        </div>

        <footer className="flex flex-col items-start justify-between gap-3 border-t border-line pt-6 text-sm text-ink-muted sm:flex-row sm:items-center">
          <Mark size="sm" />
          <span>Made in Bengaluru at AI Builder&rsquo;s Day &rsquo;26.</span>
        </footer>
      </main>
    </div>
  )
}
