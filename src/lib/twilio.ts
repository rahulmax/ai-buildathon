import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

// Twilio WhatsApp: check that a webhook came from Twilio, fetch its media, send a reply.
// No SDK; three plain HTTP calls.

const sid = () => process.env.TWILIO_ACCOUNT_SID!
const token = () => process.env.TWILIO_AUTH_TOKEN!
const basicAuth = () => `Basic ${Buffer.from(`${sid()}:${token()}`).toString('base64')}`

export const twilioReady = () => Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)

// Twilio signs the full webhook URL plus every POST param, sorted by name, with the auth token.
export function validSignature(url: string, params: Record<string, string>, signature: string | null) {
  if (!signature) return false
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('')
  const expected = createHmac('sha1', token()).update(data).digest()
  const given = Buffer.from(signature, 'base64')
  return given.length === expected.length && timingSafeEqual(given, expected)
}

// Media URLs need the account's credentials. They redirect to storage, which doesn't.
export async function fetchMedia(url: string) {
  const res = await fetch(url, { headers: { Authorization: basicAuth() } })
  if (!res.ok) throw new Error(`Twilio media ${res.status}`)
  return res.blob()
}

// from and to are in Twilio's form: "whatsapp:+14155238886".
export async function sendWhatsApp(from: string, to: string, body: string) {
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid()}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ From: from, To: to, Body: body }),
  })
  if (!res.ok) throw new Error(`Twilio send ${res.status}: ${await res.text()}`)
}

const escapeXml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!)

// The webhook's own response. A message here is the instant "got it"; the real reply follows.
export function twiml(message?: string) {
  const body = message ? `<Message>${escapeXml(message)}</Message>` : ''
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    headers: { 'Content-Type': 'text/xml' },
  })
}
