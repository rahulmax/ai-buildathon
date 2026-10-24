import type { Metadata } from 'next'
import Form from 'next/form'
import Link from 'next/link'
import { ChevronRight, Search } from 'lucide-react'
import { Back } from '@/components/back'
import { CancelInvoice } from '@/components/cancel-invoice'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { formatDate } from '@/lib/dates'
import { listInvoices, type InvoiceRow } from '@/lib/invoices'
import { formatINR } from '@/lib/money'
import { requireWorkspace } from '@/lib/workspace'

export const metadata: Metadata = { title: 'Invoices' }

function Status({ status }: { status: InvoiceRow['status'] }) {
  if (status === 'paid') return <Badge className="bg-ok-50 text-ok-700 dark:bg-ok-100">Paid</Badge>
  if (status === 'cancelled') return <Badge variant="secondary">Cancelled</Badge>
  return <Badge variant="outline">Open</Badge>
}

export default async function InvoicesPage({ searchParams }: PageProps<'/invoices'>) {
  const ws = await requireWorkspace()
  const { q: raw } = await searchParams
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? ''
  const invoices = await listInvoices(ws.id, q)

  return (
    <main className="shell stagger gap-6 py-6">
      <Back />
      <h1 className="rise kicker">Invoices</h1>

      <Form action="/invoices" replace className="rise relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Search by customer"
          aria-label="Search by customer"
          className="h-11 pl-9"
        />
      </Form>

      {invoices.length === 0 ? (
        <p className="card rise p-6 text-center text-muted-foreground">
          {q ? `No invoices for “${q}”.` : 'No invoices yet. Say one on the home screen.'}
        </p>
      ) : (
        <ul className="card rise overflow-hidden">
          {invoices.map((inv) => (
            <li key={inv.id} className="flex flex-col border-b border-line last:border-0">
              <Link
                href={`/i/${inv.public_slug}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={`truncate font-medium ${inv.status === 'cancelled' ? 'text-muted-foreground' : ''}`}>
                    {inv.customer_name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {inv.number} · {formatDate(inv.issue_date)}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  <span
                    className={`amount text-sm font-medium ${inv.status === 'cancelled' ? 'text-muted-foreground line-through' : ''}`}
                  >
                    {formatINR(inv.total)}
                  </span>
                  <Status status={inv.status} />
                </span>
                <ChevronRight className="size-4 text-ink-muted" />
              </Link>
              {inv.status === 'open' && !inv.has_payment && (
                <div className="flex justify-end px-2 pb-2">
                  <CancelInvoice invoiceId={inv.id} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
