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
      Create an invoice
      <ArrowRight
        data-icon="inline-end"
        className="transition-transform duration-state ease-ambient group-hover/button:translate-x-0.5"
      />
    </Link>
  )
}

// The demo sentence, and the invoice it becomes. 5% GST in-state splits into CGST and SGST.
function SpokenInvoice() {
  const subtotal = 40_000_00
  const half = subtotal * 0.025
  return (
    <div className="card flex w-full max-w-xs flex-col gap-3 p-4">
      <div className="flex items-start gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 dark:bg-brand-100">
          <Mic className="size-3.5" />
        </span>
        <p className="text-sm leading-snug text-ink-secondary">
          &ldquo;Invoice Acme ₹40,000 for party catering, 5% GST, due in 7&nbsp;days.&rdquo;
        </p>
      </div>
      <div className="flex flex-col gap-1.5 border-t border-line pt-3 text-sm">
        <div className="flex items-baseline justify-between">
          <span className="font-semibold">Acme</span>
          <span className="text-xs text-ink-muted">Due 31 Oct</span>
        </div>
        <Row label="Party catering" value={formatINR(subtotal)} />
        <Row label="CGST 2.5%" value={formatINR(half)} muted />
        <Row label="SGST 2.5%" value={formatINR(half)} muted />
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
  const qr = await qrSvg(upiLink({ upiId: 'kaveri@okicici', payee: 'Kaveri Caterers', amount: 42_000_00, note: 'INV-2627-0007' }))
  return (
    <div className="flex flex-1 flex-col overflow-clip">
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-24 px-4 pt-5 pb-10 md:gap-32 md:px-8">
        <header className="rise relative z-10 flex items-center justify-between">
          <Mark />
          <Link href="/start" className={buttonVariants({ variant: 'ghost' })}>
            Get started
          </Link>
        </header>

        <section className="wash wash-hero stagger grid items-center gap-12 md:grid-cols-[1.1fr_1fr] md:gap-16">
          <div className="flex flex-col gap-6">
            <p className="kicker rise">Invoicing &amp; GST bookkeeping</p>
            <h1 className="rise rise-blur text-5xl leading-[1.02] font-semibold md:text-7xl">
              Voice-first GST invoicing for Indian businesses.
            </h1>
            <p className="rise max-w-lg text-lg leading-relaxed text-muted-foreground">
              Describe the work out loud to generate a compliant GST invoice with HSN/SAC codes, a scannable UPI QR code,
              and a payment link ready to share on WhatsApp.
            </p>
            <div className="rise flex flex-col items-start gap-3">
              <Start />
              <p className="text-sm text-ink-muted">Start immediately in your browser — no account setup required.</p>
              {emailEnabled() && (
                <Link href="/signin" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                  Already have a workspace? Sign in
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
          <h2 className="reveal text-2xl font-semibold md:text-3xl">Multilingual voice recognition built for Indian billing</h2>
          <ul className="reveal-group flex flex-wrap justify-center gap-2">
            {LANGUAGES.map((l) => (
              <li key={l.lang} lang={l.lang} className="rounded-full border border-line bg-surface px-4 py-2 text-lg">
                {l.label}
              </li>
            ))}
          </ul>
          <p className="reveal max-w-md text-muted-foreground">
            Dictate invoices in English, Hindi, Kannada, or Malayalam. Hisab accurately extracts client names, rupee
            amounts, tax slabs, and due dates into an editable draft before you issue the invoice.
          </p>
        </section>

        <section className="flex flex-col gap-8">
          <div className="reveal flex flex-col gap-2">
            <p className="kicker">Receivables &amp; payables</p>
            <h2 className="text-3xl font-semibold md:text-4xl">Track client billing and vendor expenses in one place</h2>
          </div>
          <div className="reveal-group grid gap-6 md:grid-cols-2">
            <Way
              src="/landing/say.jpg"
              alt="A developer saying an invoice into his phone by a window"
              icon={<Mic className="size-3.5" />}
              kicker="Receivables"
              title="Issue GST invoices in seconds"
            >
              Speak or type what you are billing for, and Hisab populates the customer details, line items, HSN/SAC
              codes, and CGST/SGST or IGST splits. Review the draft and share a dedicated payment page with a built-in
              UPI QR code.
            </Way>
            <Way
              src="/landing/snap.jpg"
              alt="A shopkeeper photographing a paper bill on his counter"
              icon={<Camera className="size-3.5" />}
              kicker="Expenses"
              title="Log vendor bills for input tax credit"
            >
              Upload a photo or PDF of any supplier receipt. Hisab extracts the vendor name, GSTIN, invoice total, and
              tax breakdown to record the expense and track your eligible input GST automatically.
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
            <p className="kicker">Accounting</p>
            <h2 className="text-3xl font-semibold md:text-4xl">Double-entry accounting without the spreadsheet work</h2>
            <p className="leading-relaxed text-muted-foreground">
              Every invoice you issue, payment you collect, and bill you record posts directly to a balanced
              double-entry ledger, giving you an up-to-date view of your receivables and tax position.
            </p>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="card flex flex-col gap-1 p-4">
                <dt className="kicker">Accounts receivable</dt>
                <dd className="text-sm text-muted-foreground">
                  Track unpaid client balances sorted by due date and send WhatsApp payment follow-ups in one tap.
                </dd>
              </div>
              <div className="card flex flex-col gap-1 p-4">
                <dt className="kicker">Net GST liability</dt>
                <dd className="text-sm text-muted-foreground">
                  See output tax collected minus input tax credit across CGST, SGST, and IGST for the current month.
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
              <h2 className="text-3xl font-semibold">Issue your first GST invoice in under a minute</h2>
              <p className="leading-relaxed text-muted-foreground">
                Enter your business name and UPI ID, dictate the bill details, and share a payment link with your client.
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
