import { CheckCircle2, ShieldCheck } from 'lucide-react'
import { db } from '@/lib/db'
import { formatINR } from '@/lib/money'
import { ensurePayLink, syncPayLink } from '@/lib/pinelabs'
import { qrSvg, upiLink } from '@/lib/upi'

type PayInvoice = {
  id: string; number: string; total: number; status: string; pay_link: string | null
  seller_name: string; upi_id: string
}

const payButton =
  'inline-flex h-12 w-full items-center justify-center rounded-lg bg-primary text-base font-semibold text-primary-foreground shadow-lift transition-colors duration-state ease-ambient hover:bg-brand-800'

// The one way to pay (OQ-INV-8): the Pine Labs link and its QR when the
// gateway is set up, else a UPI QR to the owner's UPI ID. Nothing for a
// cancelled invoice. Streams in, so a slow gateway never holds up the invoice.
export async function Pay({ invoiceId, url }: { invoiceId: string; url: string }) {
  const sql = await db()
  const [inv] = await sql<PayInvoice[]>`
    select i.id, i.number, i.total, i.status, i.pay_link, w.name as seller_name, w.upi_id
    from invoice i join workspace w on w.id = i.workspace_id
    where i.id = ${invoiceId}`
  if (!inv || inv.status === 'cancelled') return null

  if (inv.status === 'paid' || (await syncPayLink(inv))) {
    return (
      <p className="flex items-center justify-center gap-2 rounded-xl bg-ok-50 py-4 font-semibold text-ok-700 dark:bg-ok-100">
        <CheckCircle2 className="size-5" /> Paid. Thank you.
      </p>
    )
  }

  const gateway = await ensurePayLink(inv, url)
  const href = gateway ?? upiLink({ upiId: inv.upi_id, payee: inv.seller_name, amount: inv.total, note: inv.number })
  const qr = await qrSvg(href)

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-line bg-paper p-5">
      <div className="size-48 rounded-xl bg-white p-3 shadow-card [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: qr }} />
      {gateway ? (
        <p className="text-center text-xs text-muted-foreground">
          Scan with your phone camera, or tap below.
          <br />
          UPI, card or netbanking.
        </p>
      ) : (
        <p className="text-center text-xs text-muted-foreground">
          Scan with any UPI app, or tap below on your phone
          <br />
          <span className="font-mono">{inv.upi_id}</span>
        </p>
      )}
      <a href={href} className={payButton}>
        {gateway ? `Pay ${formatINR(inv.total)}` : `Pay ${formatINR(inv.total)} by UPI`}
      </a>
      {gateway && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" /> Secured by Pine Labs
        </p>
      )}
    </div>
  )
}

export function PaySkeleton() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-line bg-paper p-5">
      <div className="size-48 animate-pulse rounded-xl bg-muted" />
      <div className="h-4 w-40 animate-pulse rounded bg-muted" />
      <div className="h-12 w-full animate-pulse rounded-lg bg-muted" />
    </div>
  )
}
