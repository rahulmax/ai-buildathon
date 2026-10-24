import { revalidatePath } from 'next/cache'
import { parseEvent, recordGatewayPayment, settleGatewayPayment, verifyWebhook } from '@/lib/pinelabs'

// Pine Labs calls this when a payment link is paid (ORDER_PROCESSED or
// payment_link.processed) and, for some merchants, when an order settles.
// Signed; anything unsigned is refused. Other events get a 200 and nothing else.
export async function POST(req: Request) {
  const raw = await req.text()
  if (!verifyWebhook(raw, req.headers)) {
    return Response.json({ error: 'Bad signature' }, { status: 401 })
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return Response.json({ error: 'Bad JSON' }, { status: 400 })
  }

  const event = parseEvent(body)
  const merchant = process.env.PINE_LABS_MERCHANT_ID
  if (merchant && event.merchantId && event.merchantId !== merchant) {
    return Response.json({ ok: true, ignored: 'other merchant' })
  }
  const gatewayRef = event.orderId ?? event.linkId
  if (event.kind === 'other' || !gatewayRef) {
    return Response.json({ ok: true, ignored: event.type || 'unknown' })
  }

  if (event.kind === 'paid') {
    const result = await recordGatewayPayment({
      ids: [event.orderId, event.linkId],
      references: event.references,
      gatewayRef,
      amount: event.amount,
    })
    if (result === 'not_found') console.warn('Pine Labs payment for no known invoice', event)
    if (result === 'recorded') revalidatePath('/', 'layout')
    return Response.json({ ok: true, result })
  }

  const settled = await settleGatewayPayment(gatewayRef, event.settledAmount)
  if (settled) revalidatePath('/', 'layout')
  return Response.json({ ok: true, result: settled ? 'settled' : 'skipped' })
}
