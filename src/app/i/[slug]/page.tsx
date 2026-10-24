import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { CancelInvoice } from '@/components/cancel-invoice'
import { Share } from '@/components/share'
import { db } from '@/lib/db'
import { formatDate } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { qrSvg, upiLink } from '@/lib/upi'
import { currentWorkspace } from '@/lib/workspace'

type Invoice = {
  id: string; workspace_id: string; number: string; issue_date: string; due_date: string | null
  place_of_supply: string; subtotal: number; cgst: number; sgst: number; igst: number; total: number
  status: string; seller_name: string; seller_state: string; seller_gstin: string | null; upi_id: string
  customer_name: string; customer_phone: string | null; customer_gstin: string | null
  cancelled_on: string | null; has_payment: boolean
}

async function load(slug: string) {
  const sql = await db()
  const [inv] = await sql<Invoice[]>`
    select i.id, i.workspace_id, i.number, i.issue_date, i.due_date, i.place_of_supply, i.subtotal,
      i.cgst, i.sgst, i.igst, i.total, i.status,
      w.name as seller_name, w.state as seller_state, w.gstin as seller_gstin, w.upi_id,
      c.name as customer_name, c.phone as customer_phone, c.gstin as customer_gstin,
      to_char(i.cancelled_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD') as cancelled_on,
      exists (select 1 from payment p where p.invoice_id = i.id) as has_payment
    from invoice i join workspace w on w.id = i.workspace_id join customer c on c.id = i.customer_id
    where i.public_slug = ${slug}`
  if (!inv) return null
  const lines = await sql<{
    description: string; sac_hsn: string | null; quantity: number; rate: number; amount: number; gst_rate: number
  }[]>`
    select description, sac_hsn, quantity, rate, amount, gst_rate from invoice_line
    where invoice_id = ${inv.id}`
  return { inv, lines }
}

export async function generateMetadata({ params }: PageProps<'/i/[slug]'>): Promise<Metadata> {
  const data = await load((await params).slug)
  if (!data) return {}
  // A cancelled link gives nothing away, not even in the tab title.
  if (data.inv.status === 'cancelled') return { title: `Cancelled invoice from ${data.inv.seller_name}` }
  return { title: `${data.inv.number} from ${data.inv.seller_name} · ${formatINR(data.inv.total)}` }
}

export default async function InvoicePage({ params, searchParams }: PageProps<'/i/[slug]'>) {
  const { slug } = await params
  const { new: isNew } = await searchParams
  const data = await load(slug)
  if (!data) notFound()
  const { inv, lines } = data
  const owner = (await currentWorkspace())?.id === inv.workspace_id
  const cancelled = inv.status === 'cancelled'
  if (cancelled && !owner) {
    return (
      <main className="shell gap-6 py-6">
        <div className="card rise flex flex-col items-center gap-2 p-8 text-center">
          <span className="font-semibold">{inv.seller_name}</span>
          <p className="text-muted-foreground">This invoice was cancelled.</p>
        </div>
      </main>
    )
  }
  // A GST charge makes it a tax invoice; without a GSTIN it's a bill of supply.
  const taxInvoice = inv.cgst + inv.sgst + inv.igst > 0 || Boolean(inv.seller_gstin)
  const h = await headers()
  const url = `${h.get('x-forwarded-proto') ?? (h.get('host')?.startsWith('localhost') ? 'http' : 'https')}://${h.get('host')}/i/${slug}`
  const paid = inv.status === 'paid'
  const pay = upiLink({ upiId: inv.upi_id, payee: inv.seller_name, amount: inv.total, note: inv.number })
  const qr = await qrSvg(pay)
  const rate = lines[0]?.gst_rate ?? 0
  const same = lines.every((l) => l.gst_rate === rate)

  return (
    <main className="shell stagger gap-6 py-6">
      {owner && cancelled && (
        <div className="rise flex items-start justify-between gap-3 rounded-2xl border border-crit-200 bg-crit-50 p-4 dark:bg-crit-100">
          <div className="flex flex-col gap-1">
            <p className="font-semibold text-crit-700">Cancelled{inv.cancelled_on && ` on ${formatDate(inv.cancelled_on)}`}</p>
            <p className="text-sm text-muted-foreground">
              Its link now shows only that it was cancelled. Say the invoice again to make a correct one.
            </p>
          </div>
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            Done
          </Link>
        </div>
      )}
      {owner && !cancelled && (
        <div className="rise flex flex-col gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-200 dark:bg-brand-100">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-brand-900">{isNew ? 'Invoice ready. Send it.' : 'Your invoice'}</p>
            <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
              Done
            </Link>
          </div>
          <Share
            phone={inv.customer_phone}
            url={url}
            text={`Hi ${inv.customer_name}, here’s invoice ${inv.number} for ${formatINR(inv.total)}${
              inv.due_date ? `, due ${formatDate(inv.due_date)}` : ''
            }. You can pay by UPI from the link:\n{link}\n\nThanks,\n${inv.seller_name}`}
          />
          {inv.status === 'open' && !inv.has_payment && (
            <div className="flex justify-end">
              <CancelInvoice invoiceId={inv.id} />
            </div>
          )}
        </div>
      )}

      <article className="card rise flex flex-col gap-6 overflow-hidden p-5">
        <div aria-hidden className="-mx-5 -mt-5 h-1.5 bg-primary" />
        <header className="flex items-start justify-between gap-4">
          <div className="flex flex-col">
            <span className="text-lg font-semibold">{inv.seller_name}</span>
            <span className="text-xs text-muted-foreground">{inv.seller_state}</span>
            {inv.seller_gstin && <span className="font-mono text-xs text-muted-foreground">GSTIN {inv.seller_gstin}</span>}
          </div>
          <div className="flex flex-col items-end text-right">
            <span className="kicker">{taxInvoice ? 'Tax invoice' : 'Bill of supply'}</span>
            <span className="font-mono text-sm">{inv.number}</span>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex flex-col">
            <span className="kicker">Billed to</span>
            <span className="font-medium">{inv.customer_name}</span>
            {inv.customer_gstin && <span className="font-mono text-xs text-muted-foreground">GSTIN {inv.customer_gstin}</span>}
            <span className="text-xs text-muted-foreground">Place of supply: {inv.place_of_supply}</span>
          </div>
          <div className="flex flex-col items-end text-right">
            <span className="kicker">Issued</span>
            <span>{formatDate(inv.issue_date)}</span>
            {inv.due_date && (
              <>
                <span className="kicker mt-2">Due</span>
                <span>{formatDate(inv.due_date)}</span>
              </>
            )}
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="kicker pb-2 text-left">Item</th>
              <th className="kicker pb-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                <td className="py-3">
                  <span className="block">{l.description}</span>
                  {l.sac_hsn && (
                    <span className="block text-xs text-muted-foreground">
                      {l.sac_hsn.length === 6 && l.sac_hsn.startsWith('99') ? 'SAC' : 'HSN'} {l.sac_hsn}
                    </span>
                  )}
                  {l.quantity !== 1 && (
                    <span className="amount text-xs text-muted-foreground">
                      {l.quantity} × {formatINR(l.rate)}
                    </span>
                  )}
                </td>
                <td className="amount py-3 text-right align-top">{formatINR(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="flex flex-col gap-1 rounded-xl border border-line bg-paper p-4 text-sm">
          <Row label="Subtotal" value={formatINR(inv.subtotal)} />
          {inv.cgst > 0 && <Row label={`CGST${same ? ` ${rate / 2}%` : ''}`} value={formatINR(inv.cgst)} />}
          {inv.sgst > 0 && <Row label={`SGST${same ? ` ${rate / 2}%` : ''}`} value={formatINR(inv.sgst)} />}
          {inv.igst > 0 && <Row label={`IGST${same ? ` ${rate}%` : ''}`} value={formatINR(inv.igst)} />}
          <div className="mt-2 flex items-baseline justify-between">
            <dt className="font-medium">Total</dt>
            <dd className="amount text-3xl font-semibold">{formatINR(inv.total)}</dd>
          </div>
        </dl>

        {paid ? (
          <p className="flex items-center justify-center gap-2 rounded-xl bg-ok-50 py-4 font-semibold text-ok-700 dark:bg-ok-100">
            <CheckCircle2 className="size-5" /> Paid. Thank you.
          </p>
        ) : (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-line bg-paper p-5">
            <div className="size-48 rounded-xl bg-white p-3 shadow-card [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: qr }} />
            <p className="text-center text-xs text-muted-foreground">
              Scan with any UPI app, or tap below on your phone
              <br />
              <span className="font-mono">{inv.upi_id}</span>
            </p>
            <a
              href={pay}
              className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-primary text-base font-semibold text-primary-foreground shadow-lift transition-colors duration-state ease-ambient hover:bg-brand-800"
            >
              Pay {formatINR(inv.total)} by UPI
            </a>
          </div>
        )}
      </article>
    </main>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <dt>{label}</dt>
      <dd className="amount">{value}</dd>
    </div>
  )
}
