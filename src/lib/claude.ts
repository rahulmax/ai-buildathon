import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { BillExtract, InvoiceExtract } from './schemas'
import type { Code } from './hsn'

const client = new Anthropic()
const MODEL = 'claude-opus-5-5'

const INVOICE_PROMPT = `You turn a spoken invoice from an Indian freelancer or small business into fields.
The speech may be English, Hindi, Kannada, Malayalam, or a mix. Write descriptions and names in English (transliterate names; keep company names as spoken).

Rules:
- Return only what was said. If something wasn't said, return null. Never guess a GST rate or a due date.
- Amounts are rupees. "40 thousand" = 40000, "1.5 lakh" = 150000, "2 crore" = 20000000. Kannada "saavira", Hindi/Malayalam "hazaar"/"aayiram" = thousand.
- If one amount is said for the whole job, return one line with quantity 1.
- "due in 7 days" → due_in_days 7. A named date → due_date as YYYY-MM-DD, assuming the next such date after today.
- customer_state only if a state or city is said (map a city to its state, e.g. Bengaluru → Karnataka).
- service_number: the number of the seller's service that the line is for, from the list given. null if none fits.`

export async function extractInvoice(transcript: string, today: string, services: string[] = []) {
  const list = services.length
    ? `The seller's services:\n${services.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n`
    : ''
  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: 'low', format: zodOutputFormat(InvoiceExtract) },
    system: INVOICE_PROMPT,
    messages: [{ role: 'user', content: `Today is ${today}.\n\n${list}Spoken invoice:\n${transcript}` }],
  })
  if (!res.parsed_output) throw new Error(`Extract failed: ${res.stop_reason}`)
  return res.parsed_output
}

const BILL_PROMPT = `You read a photo of an Indian bill or receipt into fields.

Rules:
- Return only what is printed or written. If you can't read a field, return null. Never invent a GSTIN.
- Amounts are rupees. subtotal is before tax; total is what was paid.
- If the bill shows CGST and SGST, fill those; if IGST, fill that. If no GST is shown, return null for all three.
- bill_date as YYYY-MM-DD. Indian bills write dates day first.
- category is one of travel, food, software, equipment, rent, other. Restaurants and cafés are food.
- seller_state from the seller's address or the first two digits of their GSTIN (29 = Karnataka, 32 = Kerala, 27 = Maharashtra, 07 = Delhi, 33 = Tamil Nadu, 36 = Telangana).`

type ImageType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

export async function readBill(base64: string, mediaType: ImageType) {
  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: 'low', format: zodOutputFormat(BillExtract) },
    system: BILL_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: 'Read this bill.' },
        ],
      },
    ],
  })
  if (!res.parsed_output) throw new Error(`Read failed: ${res.stop_reason}`)
  return res.parsed_output
}

const LANGUAGES: Record<string, string> = {
  en: 'English', eng: 'English', hi: 'Hindi', hin: 'Hindi',
  kn: 'Kannada', kan: 'Kannada', ml: 'Malayalam', mal: 'Malayalam',
}

export const languageName = (code: string | null) => (code && LANGUAGES[code.toLowerCase()]) || 'English'

// Fallback when the collections agent is unavailable: a reminder in the
// language the invoice was spoken in.
export async function draftReminder(o: {
  sellerName: string
  customerName: string
  invoiceNumber: string
  amount: string
  daysOverdue: number
  link: string
  language: string
}) {
  const tone =
    o.daysOverdue <= 0 ? 'a friendly heads-up' : o.daysOverdue <= 14 ? 'a polite reminder' : 'firm but courteous'
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    output_config: { effort: 'low' },
    system:
      'You write short WhatsApp payment reminders for Indian freelancers. Under 60 words. No subject line, no placeholders, no emoji spam. Reply with the message only.',
    messages: [
      {
        role: 'user',
        content: `Write ${tone} in ${o.language}, from ${o.sellerName} to ${o.customerName}, for invoice ${o.invoiceNumber} of ${o.amount}${o.daysOverdue > 0 ? `, ${o.daysOverdue} days overdue` : ''}. End with this link on its own line: ${o.link}`,
      },
    ],
  })
  const text = res.content.find((b) => b.type === 'text')
  return text?.type === 'text' ? text.text.trim() : null
}

const CodePick = z.object({
  items: z.array(
    z.object({
      service: z.string(),
      kind: z.enum(['service', 'goods']),
      code: z.string().nullable(),
      alternatives: z.array(z.string()),
    }),
  ),
})

// Match what someone sells to official SAC (services) or HSN (goods) codes.
// The model may only pick codes from the lists we give it.
export async function pickCodes(services: string[], sac: Code[], hsnShortlists: Record<string, Code[]>) {
  const sacList = sac.map((c) => `${c.code} ${c.desc}`).join('\n')
  const goods = services
    .map((s) => `For "${s}" if it is goods:\n${(hsnShortlists[s] ?? []).map((c) => `${c.code} ${c.desc}`).join('\n') || '(no candidates)'}`)
    .join('\n\n')
  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: 'low', format: zodOutputFormat(CodePick) },
    system: [
      {
        type: 'text',
        text: `You pick GST codes for what an Indian freelancer or small business sells.
For each item, decide if it's a service or goods. Services take a 6-digit SAC code from the SAC list. Goods take an HSN code from that item's candidate list.
Pick the most specific code that fits. Give up to 2 alternatives. Use only codes that appear in the lists, exactly as written. If nothing fits, code is null.

SAC list (official, GST portal):
${sacList}`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: `Items:\n${services.map((s) => `- ${s}`).join('\n')}\n\nHSN candidates:\n${goods}` }],
  })
  if (!res.parsed_output) throw new Error(`Code pick failed: ${res.stop_reason}`)
  return res.parsed_output.items
}
