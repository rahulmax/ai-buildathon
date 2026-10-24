import 'server-only'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import type { TransactionSql } from 'postgres'
import { db } from './db'
import { todayIST } from './dates'
import { postEntry } from './ledger'

// Pine Labs Online (Plural) payment gateway. Docs: https://www.pinelabs.com/docs/online-payments
// One link per invoice, the one way to pay. A webhook (or a status check) marks the invoice paid.
// Demo runs on our single test merchant (OQ-INV-10).

const BASE_URL = (process.env.PINE_LABS_BASE_URL ?? 'https://pluraluat.v2.pinepg.in').replace(/\/+$/, '')

export const pineLabsReady = () =>
  Boolean(process.env.PINE_LABS_CLIENT_ID && process.env.PINE_LABS_CLIENT_SECRET)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Money = { value?: number; currency?: string }

type LinkResponse = {
  payment_link?: string
  payment_link_id?: string
  order_id?: string
  status?: string
  amount?: Money
}

const globalForPine = globalThis as unknown as { pineToken?: { value: string; expiresAt: number } }

// Bearer token from client id and secret. Cached until a minute before it expires.
async function token() {
  const cached = globalForPine.pineToken
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value
  const res = await fetch(`${BASE_URL}/api/auth/v1/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: process.env.PINE_LABS_CLIENT_ID,
      client_secret: process.env.PINE_LABS_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
    signal: AbortSignal.timeout(5_000),
  })
  if (!res.ok) throw new Error(`Pine Labs token failed: ${res.status} ${(await res.text()).slice(0, 200)}`)
  const data = (await res.json()) as { access_token: string; expires_at?: string; expires_in?: number }
  const expiresAt = data.expires_at
    ? Date.parse(data.expires_at)
    : Date.now() + (data.expires_in ?? 3600) * 1000
  globalForPine.pineToken = { value: data.access_token, expiresAt }
  return data.access_token
}

async function call<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown, timeoutMs = 8_000): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${await token()}`,
      'Request-ID': randomUUID(),
      'Request-Timestamp': new Date().toISOString(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`Pine Labs ${method} ${path} failed: ${res.status} ${(await res.text()).slice(0, 200)}`)
  return (await res.json()) as T
}

// Links last as long as Pine Labs allows (180 days), less a day of margin.
const expiry = () => new Date(Date.now() + 179 * 86_400_000).toISOString()

// The invoice id is the merchant reference, so asking twice returns the same link.
async function createPaymentLink(o: {
  invoiceId: string
  number: string
  sellerName: string
  amount: number
  returnUrl: string
  timeoutMs: number
}) {
  const res = await call<LinkResponse>(
    'POST',
    '/api/pay/v1/paymentlink',
    {
      amount: { value: o.amount, currency: 'INR' },
      description: `Invoice ${o.number} from ${o.sellerName}`.slice(0, 100),
      merchant_payment_link_reference: o.invoiceId,
      expire_by: expiry(),
      callback_url: o.returnUrl,
      merchant_metadata: { invoice_number: o.number },
    },
    o.timeoutMs,
  )
  if (!res.payment_link) throw new Error(`Pine Labs gave no link: ${JSON.stringify(res).slice(0, 200)}`)
  return { url: res.payment_link, orderId: res.order_id ?? res.payment_link_id ?? null }
}

const linkByReference = (invoiceId: string, timeoutMs = 4_000) =>
  call<LinkResponse>('GET', `/api/pay/v1/paymentlink/ref/${encodeURIComponent(invoiceId)}`, undefined, timeoutMs)

export type PayLinkInvoice = {
  id: string
  number: string
  total: number
  status: string
  pay_link: string | null
  seller_name: string
}

// The invoice's Pine Labs link, made on first need and stored. Never throws:
// null means pay by UPI instead.
export async function ensurePayLink(inv: PayLinkInvoice, returnUrl: string, timeoutMs = 6_000) {
  if (inv.pay_link) return inv.pay_link
  if (!pineLabsReady() || inv.status !== 'open' || inv.total < 100) return null
  try {
    const link = await createPaymentLink({
      invoiceId: inv.id,
      number: inv.number,
      sellerName: inv.seller_name,
      amount: inv.total,
      returnUrl,
      timeoutMs,
    })
    const sql = await db()
    const [row] = await sql<{ pay_link: string }[]>`
      update invoice set pay_link = ${link.url}, pay_order_id = ${link.orderId}
      where id = ${inv.id} and pay_link is null
      returning pay_link`
    if (row) return row.pay_link
    const [current] = await sql<{ pay_link: string | null }[]>`select pay_link from invoice where id = ${inv.id}`
    return current?.pay_link ?? link.url
  } catch (e) {
    console.error('Pine Labs payment link failed, falling back to UPI', e)
    return null
  }
}

// Ask Pine Labs whether the link was paid, in case the webhook hasn't come
// (or isn't set up). Returns true if the invoice is now paid.
export async function syncPayLink(inv: Pick<PayLinkInvoice, 'id' | 'status' | 'pay_link'>) {
  if (!pineLabsReady() || !inv.pay_link || inv.status !== 'open') return false
  try {
    const link = await linkByReference(inv.id)
    if (link.status !== 'PROCESSED') return false
    const gatewayRef = link.order_id ?? link.payment_link_id
    if (!gatewayRef) return false
    const result = await recordGatewayPayment({
      ids: [link.order_id, link.payment_link_id],
      references: [inv.id],
      gatewayRef,
      amount: link.amount?.value ?? null,
    })
    return result === 'recorded' || result === 'duplicate'
  } catch (e) {
    console.error('Pine Labs status check failed', e)
    return false
  }
}

// Turn off a cancelled invoice's link so nobody pays it. Never throws.
export async function cancelPayLink(invoiceId: string) {
  if (!pineLabsReady()) return
  try {
    const link = await linkByReference(invoiceId)
    if (!link.payment_link_id || link.status === 'PROCESSED' || link.status === 'CANCELLED') return
    await call('PUT', `/api/pay/v1/paymentlink/${encodeURIComponent(link.payment_link_id)}/cancel`)
  } catch (e) {
    console.error('Pine Labs link cancel failed', e)
  }
}

// Webhooks follow the Standard Webhooks scheme: HMAC-SHA256 over
// "webhook-id.webhook-timestamp.body", base64, sent as "v1,<sig>".
// https://www.pinelabs.com/docs/online-payments/developer-tools/developer-tools-webhooks/webhook-signature-verification
export function verifyWebhook(raw: string, headers: Headers) {
  const secret = process.env.PINE_LABS_WEBHOOK_SECRET
  if (!secret) return false
  const id = headers.get('webhook-id')
  const ts = headers.get('webhook-timestamp')
  const sig = headers.get('webhook-signature')
  if (!id || !ts || !sig) return false
  const age = Math.abs(Date.now() / 1000 - Number(ts))
  if (!Number.isFinite(age) || age > 30 * 60) return false

  // The dashboard secret signs as is. A "whsec_" or base64 secret signs decoded.
  const keys = [Buffer.from(secret, 'utf8')]
  const b64 = secret.startsWith('whsec_') ? secret.slice(6) : secret
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(b64) && b64.length % 4 === 0) keys.push(Buffer.from(b64, 'base64'))

  const content = `${id}.${ts}.${raw}`
  const expected = keys.map((k) => createHmac('sha256', k).update(content, 'utf8').digest())
  const given = sig
    .split(' ')
    .filter(Boolean)
    .map((s) => Buffer.from(s.includes(',') ? s.slice(s.indexOf(',') + 1) : s, 'base64'))
  return given.some((g) => expected.some((e) => e.length === g.length && timingSafeEqual(e, g)))
}

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {})
const str = (o: Obj, ...keys: string[]) => {
  for (const k of keys) if (typeof o[k] === 'string' && o[k]) return o[k] as string
  return null
}
const paise = (o: Obj, ...keys: string[]) => {
  for (const k of keys) {
    const v = obj(o[k]).value
    if (typeof v === 'number' && v > 0) return v
  }
  return null
}

export type PineEvent = {
  kind: 'paid' | 'settled' | 'other'
  type: string
  orderId: string | null
  linkId: string | null
  references: string[]
  amount: number | null
  settledAmount: number | null
  merchantId: string | null
}

// Payloads come snake_case (ORDER_PROCESSED) or camelCase, and payment-link
// events carry the link id and our reference. Read whichever is there.
export function parseEvent(body: unknown): PineEvent {
  const b = obj(body)
  const d = obj(b.data ?? b)
  const type = str(b, 'event_type', 'eventType', 'event', 'type') ?? str(d, 'event_type', 'eventType') ?? ''
  const payment = obj(((d.payments ?? []) as unknown[])[0])
  const kind = /settled/i.test(type) && !/reject/i.test(type)
    ? 'settled'
    : /processed/i.test(type) && !/refund|partial/i.test(type)
      ? 'paid'
      : 'other'
  return {
    kind,
    type,
    orderId: str(d, 'order_id', 'orderId'),
    linkId: str(d, 'payment_link_id', 'paymentLinkId'),
    references: [
      str(d, 'merchant_payment_link_reference', 'merchantPaymentLinkReference'),
      str(d, 'merchant_order_reference', 'merchantOrderReference'),
    ].filter((r): r is string => Boolean(r)),
    amount:
      paise(d, 'order_amount', 'orderAmount', 'amount') ?? paise(payment, 'payment_amount', 'paymentAmount'),
    settledAmount: paise(d, 'settlement_amount', 'settlementAmount', 'settled_amount', 'net_amount'),
    merchantId: str(d, 'merchant_id', 'merchantId'),
  }
}

export type GatewayResult = 'recorded' | 'duplicate' | 'not_found' | 'not_open'

// A gateway payment, in one transaction: payment row, invoice paid, and
// debit pine_labs_clearing / credit receivable (OQ-INV-11). Workspace comes
// from the invoice; there is no cookie on a webhook.
export async function recordGatewayPayment(o: {
  ids: (string | null | undefined)[]
  references?: (string | null | undefined)[]
  gatewayRef: string
  amount?: number | null
}): Promise<GatewayResult> {
  const ids = o.ids.filter((i): i is string => Boolean(i))
  const refs = (o.references ?? []).filter((r): r is string => Boolean(r && UUID.test(r)))
  const sql = await db()
  const result = await sql.begin(async (tx) => {
    const [inv] = await tx<{
      id: string; workspace_id: string; number: string; customer_id: string; total: number; status: string
    }[]>`
      select id, workspace_id, number, customer_id, total, status from invoice
      where pay_order_id in ${tx(ids.length ? ids : [''])}
        or id::text in ${tx(refs.length ? refs : [''])}
      limit 1 for update`
    if (!inv) return 'not_found' as const
    const [seen] = await tx`select id from payment where gateway_ref = ${o.gatewayRef}`
    if (seen) return 'duplicate' as const
    if (inv.status !== 'open') {
      console.warn(`Pine Labs payment ${o.gatewayRef} for ${inv.number}, which is ${inv.status}. Not recorded.`)
      return 'not_open' as const
    }
    const amount = o.amount && o.amount > 0 ? o.amount : inv.total
    const [pay] = await tx<{ id: string }[]>`
      insert into payment (invoice_id, amount, method, gateway_ref)
      values (${inv.id}, ${amount}, 'pine_labs', ${o.gatewayRef})
      on conflict do nothing
      returning id`
    if (!pay) return 'duplicate' as const
    if (amount >= inv.total) await tx`update invoice set status = 'paid' where id = ${inv.id}`
    await postEntry(tx, {
      workspaceId: inv.workspace_id,
      date: todayIST(),
      memo: `Pine Labs payment for ${inv.number}`,
      sourceType: 'payment',
      sourceId: pay.id,
      lines: [
        { account: 'pine_labs_clearing', debit: amount },
        { account: 'receivable', credit: amount, customerId: inv.customer_id },
      ],
    })
    return 'recorded' as const
  })
  return result
}

type Unsettled = { id: string; amount: number; number: string; workspace_id: string }

// Payout lands: debit bank (payout), debit expenses (fee), credit pine_labs_clearing.
async function settleOne(tx: TransactionSql, p: Unsettled, payout: number) {
  const fee = p.amount - payout
  const [s] = await tx<{ id: string }[]>`
    insert into settlement (workspace_id, payment_id, payout, fee)
    values (${p.workspace_id}, ${p.id}, ${payout}, ${fee})
    on conflict do nothing
    returning id`
  if (!s) return false
  await postEntry(tx, {
    workspaceId: p.workspace_id,
    date: todayIST(),
    memo: `Pine Labs payout for ${p.number}`,
    sourceType: 'settlement',
    sourceId: s.id,
    lines: [
      { account: 'bank', debit: payout },
      { account: 'expenses', debit: fee },
      { account: 'pine_labs_clearing', credit: p.amount },
    ],
  })
  return true
}

// Gateway money not yet paid out to the bank.
export async function pendingSettlement(workspaceId: string) {
  const sql = await db()
  const [row] = await sql<{ amount: number; payments: number }[]>`
    select coalesce(sum(p.amount), 0)::bigint as amount, count(*)::int as payments
    from payment p
    join invoice i on i.id = p.invoice_id
    left join settlement s on s.payment_id = p.id
    where i.workspace_id = ${workspaceId} and p.method = 'pine_labs' and s.id is null`
  return row
}

// From a settlement webhook. Without a payout figure in the payload, assume no fee.
export async function settleGatewayPayment(gatewayRef: string, payout: number | null) {
  const sql = await db()
  return sql.begin(async (tx) => {
    const [p] = await tx<Unsettled[]>`
      select p.id, p.amount, i.number, i.workspace_id
      from payment p join invoice i on i.id = p.invoice_id
      where p.gateway_ref = ${gatewayRef} and p.method = 'pine_labs'
      for update of p`
    if (!p) return false
    const out = payout && payout > 0 && payout <= p.amount ? payout : p.amount
    return settleOne(tx, p, out)
  })
}

// The owner's "Settled": everything waiting, with what actually reached the
// bank. The fee (waiting − received) is split across payments by size.
export async function settleAll(workspaceId: string, received: number) {
  const sql = await db()
  return sql.begin(async (tx) => {
    const rows = await tx<Unsettled[]>`
      select p.id, p.amount, i.number, i.workspace_id
      from payment p
      join invoice i on i.id = p.invoice_id
      left join settlement s on s.payment_id = p.id
      where i.workspace_id = ${workspaceId} and p.method = 'pine_labs' and s.id is null
      order by p.paid_at
      for update of p`
    const waiting = rows.reduce((s, r) => s + r.amount, 0)
    if (!rows.length) return { error: 'Nothing waiting to settle.' }
    if (!Number.isInteger(received) || received <= 0 || received > waiting) {
      return { error: 'Received can’t be more than what’s waiting.' }
    }
    const fee = waiting - received
    let feeLeft = fee
    for (const [i, r] of rows.entries()) {
      const share = Math.min(feeLeft, r.amount, i === rows.length - 1 ? feeLeft : Math.round((fee * r.amount) / waiting))
      feeLeft -= share
      await settleOne(tx, r, r.amount - share)
    }
    return { error: undefined }
  })
}
