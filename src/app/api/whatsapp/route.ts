import { after } from 'next/server'
import { extractInvoice } from '@/lib/claude'
import { addDays, DEFAULT_DUE_DAYS, formatDate, todayIST } from '@/lib/dates'
import { transcribe } from '@/lib/elevenlabs'
import { canChargeGst, STATES } from '@/lib/gst'
import { saveInvoice } from '@/lib/invoices'
import { formatINR, toPaise } from '@/lib/money'
import { fetchMedia, sendWhatsApp, twilioReady, twiml, validSignature } from '@/lib/twilio'
import { workspaceById, workspaceServices, type Workspace } from '@/lib/workspace'

export const maxDuration = 60

const EXAMPLE = '“Invoice Acme ₹40,000 for landing page design, 18% GST, due in 7 days.”'
const HELP = `Send a voice note in English, Hindi, Kannada or Malayalam, like:\n\n${EXAMPLE}\n\nYou get back a GST invoice with a UPI QR, ready to forward.`

// Twilio WhatsApp webhook. Twilio gives up after 15 seconds, so answer at once with a
// "got it", then transcribe, extract and save after the response, and reply over the API.
export async function POST(req: Request) {
  if (!twilioReady()) return new Response('WhatsApp isn’t set up', { status: 503 })
  const params: Record<string, string> = {}
  for (const [k, v] of await req.formData()) if (typeof v === 'string') params[k] = v

  const url = publicUrl(req)
  if (process.env.NODE_ENV === 'production' && !validSignature(url, params, req.headers.get('x-twilio-signature'))) {
    return new Response('Bad signature', { status: 403 })
  }

  // One business behind the number for the demo.
  const ws = await workspaceById(process.env.WHATSAPP_WORKSPACE_ID)
  if (!ws) return twiml('This number isn’t linked to a business yet.')

  const type = params.MediaContentType0 ?? ''
  const audioUrl = Number(params.NumMedia) > 0 && type.startsWith('audio/') ? params.MediaUrl0 : null
  const text = (params.Body ?? '').trim()
  if (!audioUrl) {
    if (type.startsWith('image/')) return twiml('Bills from photos are in the app for now. Here, send a voice note for an invoice.')
    // "hi", "hello": no amount, nothing to invoice.
    if (!/\d/.test(text)) return twiml(HELP)
  }

  const origin = new URL(url).origin
  after(async () => {
    let reply: string
    try {
      let transcript = text
      let language: string | null = null
      if (audioUrl) {
        const heard = await transcribe(await fetchMedia(audioUrl), `note.${type.split('/')[1]?.split(';')[0] || 'ogg'}`)
        transcript = heard.text
        language = heard.language
      }
      reply = transcript ? await invoiceFrom(ws, transcript, language, origin) : `Couldn’t hear that. ${HELP}`
      if (audioUrl && transcript) reply = `Heard: “${transcript}”\n\n${reply}`
    } catch (e) {
      console.error('WhatsApp invoice failed', e)
      reply = 'Something went wrong making that invoice. Try again in a moment.'
    }
    try {
      await sendWhatsApp(params.To, params.From, reply)
    } catch (e) {
      console.error('WhatsApp reply failed', e)
    }
  })

  return twiml(audioUrl ? 'Listening…' : 'On it…')
}

// The same rules as the confirm form, minus the person: anything the form would ask
// for, ask for here, rather than guess.
async function invoiceFrom(ws: Workspace, transcript: string, language: string | null, origin: string) {
  const today = todayIST()
  const services = await workspaceServices(ws.id)
  const x = await extractInvoice(transcript, today, services.map((s) => s.name))
  const registered = canChargeGst(ws.gstin)

  const missing = [
    !x.customer_name && 'who it’s for',
    (!x.lines.length || x.lines.some((l) => l.rate_rupees == null)) && 'the amount',
    registered && x.gst_rate == null && 'the GST rate',
  ].filter(Boolean)
  if (missing.length) {
    return `I still need ${missing.join(' and ')}. Send it again with everything in one note, like:\n\n${EXAMPLE}`
  }

  // One service: every line is that service. Otherwise use the line Claude matched.
  const coded = services.filter((s) => s.code)
  const code = (n: number | null) => (n != null ? services[n - 1]?.code : null) ?? (coded.length === 1 ? coded[0].code : null)
  const state = STATES.find((s) => s.toLowerCase() === x.customer_state?.trim().toLowerCase()) ?? ws.state
  const due = x.due_date ?? addDays(today, x.due_in_days ?? DEFAULT_DUE_DAYS)

  const res = await saveInvoice(ws, {
    customer_name: x.customer_name!,
    customer_state: state,
    customer_gstin: x.customer_gstin ?? '',
    customer_phone: x.customer_phone ?? undefined,
    issue_date: today,
    due_date: due,
    lines: x.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity || 1,
      rate: toPaise(l.rate_rupees!),
      gst_rate: registered ? x.gst_rate! : 0,
      sac_hsn: code(l.service_number),
    })),
    language: language ?? undefined,
    transcript,
  })
  if ('error' in res) return `${res.error}. Send it again.`

  const gst = res.gst ? ` incl. ${formatINR(res.gst)} GST` : ''
  const dueLine = due ? ` · due ${formatDate(due)}` : ''
  return `*${res.number}* for ${x.customer_name}\n${formatINR(res.total)}${gst}${dueLine}\n\nForward this to ${x.customer_name}:\n${origin}/i/${res.slug}`
}

// The URL Twilio called, which is what it signed. Behind a proxy, the forwarded host.
function publicUrl(req: Request) {
  const url = new URL(req.url)
  const host = req.headers.get('x-forwarded-host')
  if (host) {
    url.host = host
    url.protocol = `${req.headers.get('x-forwarded-proto') ?? 'https'}:`
  }
  return url.toString()
}
