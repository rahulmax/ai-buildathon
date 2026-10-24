import 'server-only'
import { z } from 'zod'
import { BillExtract } from './schemas'

const BASE_URL = process.env.AGENTICORG_BASE_URL ?? 'https://agenticorg.hackathon.pinelabs.com'
const API = `${BASE_URL}/api/v1`

// "Say it get paid: Collections" in our AgenticOrg org.
const COLLECTIONS_AGENT_ID = process.env.AGENTICORG_COLLECTIONS_AGENT_ID ?? 'c17ea5b6-f3de-4f23-91c0-2894d4311779'
// "Say it get paid: Bill reader".
const BILL_AGENT_ID = process.env.AGENTICORG_BILL_AGENT_ID ?? '943b6156-b70e-413d-a2f1-ad1ab05e4fa6'

export const agenticOrgReady = () => Boolean(process.env.AGENTICORG_API_KEY)

type AgentRunResult = {
  run_id?: string
  status: string
  output?: unknown
  confidence?: number
  tool_calls?: Record<string, unknown>[]
  reasoning_trace?: string[]
  hitl_trigger?: string | null
}

// Agents run by UUID. A type name like 'ar_collections' goes to a different endpoint and the key is rejected.
async function runAgent(agentId: string, body: unknown, timeoutMs = 45_000): Promise<AgentRunResult> {
  const res = await fetch(`${API}/agents/${agentId}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.AGENTICORG_API_KEY}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`AgenticOrg run failed: ${res.status} ${(await res.text()).slice(0, 200)}`)
  return (await res.json()) as AgentRunResult
}

export type ChaseInput = {
  sellerName: string
  invoiceNumber: string
  customerName: string
  customerPhone: string | null
  amountRupees: string
  dueDate: string | null
  daysOverdue: number
  invoiceUrl: string
  // The one way to pay: the invoice's Pine Labs link, or the invoice page with its UPI QR.
  payLink: string
  gateway: boolean
}

export type ChaseResult = {
  message: string | null
  tone: string | null
  runId: string | null
  status: string
  confidence: number | null
  toolCalls: string[]
  trace: string[]
  hitl: string | null
}

// Find a string field anywhere in the agent's output, whatever shape it came back in.
function pick(obj: unknown, keys: string[], depth = 0): string | null {
  if (!obj || typeof obj !== 'object' || depth > 4) return null
  for (const [k, v] of Object.entries(obj)) {
    if (keys.includes(k) && typeof v === 'string' && v.trim()) return v.trim()
  }
  for (const v of Object.values(obj)) {
    const found = pick(v, keys, depth + 1)
    if (found) return found
  }
  return null
}

// The collections agent: decides the tone from how late the invoice is and
// drafts the reminder, in English, around the link we give it. It must not
// make its own payment link: one way to pay (OQ-INV-8). A human approves
// before anything is sent.
export async function runCollectionsAgent(input: ChaseInput): Promise<ChaseResult> {
  const linkStep = input.gateway
    ? `The payment link is ${input.payLink}, a Pine Labs link already made for this invoice. Use it exactly as given. Do not create another payment link.`
    : `The payment link is ${input.payLink}, which shows the invoice with a UPI QR. Use it exactly as given. Do not create a payment link.`
  const result = await runAgent(COLLECTIONS_AGENT_ID, {
    action: 'process',
    inputs: {
      task: 'chase_overdue_invoice',
      invoice: {
        number: input.invoiceNumber,
        customer_name: input.customerName,
        amount: input.amountRupees,
        currency: 'INR',
        due_date: input.dueDate,
        days_overdue: input.daysOverdue,
        invoice_url: input.invoiceUrl,
        payment_link: input.payLink,
      },
      steps: [
        linkStep,
        `Pick a tone from days_overdue: 0 or less is a friendly heads-up, 1 to 14 is a polite reminder, over 14 is firm but courteous.`,
        `Draft a short WhatsApp reminder in English, from ${input.sellerName}, with the amount, the invoice number and the payment link written out in full. Never a placeholder like [Payment Link]. Under 60 words, no subject line.`,
        'Do not send anything. A human approves the message first.',
      ],
      output_format: { message: 'string', tone: 'string' },
    },
    context: {
      seller_name: input.sellerName,
      channel: 'whatsapp',
      human_approval: 'required_before_send',
    },
  })

  return {
    message: pick(result.output, ['message', 'reminder', 'whatsapp_message', 'draft', 'body', 'text']),
    tone: pick(result.output, ['tone']),
    runId: result.run_id ?? null,
    status: result.status,
    confidence: result.confidence ?? null,
    toolCalls: (result.tool_calls ?? []).map((t) =>
      String(t.tool ?? t.name ?? t.tool_name ?? 'tool'),
    ),
    trace: result.reasoning_trace ?? [],
    hitl: result.hitl_trigger ?? null,
  }
}

// What the Bill reader may send back. Every field optional: the route fills gaps from Claude.
const AgentBill = BillExtract.partial().extend({ check: z.string().nullable().optional() })

// The Bill reader: reads the fields off the bill's text and checks the GST adds up.
// Returns null when the output isn't usable, so the caller keeps Claude's read.
export async function runBillReader(text: string) {
  const result = await runAgent(
    BILL_AGENT_ID,
    {
      action: 'process',
      inputs: {
        task: 'read_purchase_bill',
        bill_text: text,
        steps: [
          'Read the seller, their GSTIN, the bill date, the amounts and the GST from the bill text. Only what is printed; null if absent.',
          'Amounts are rupees. subtotal is before tax; total is what was paid. bill_date as YYYY-MM-DD; Indian bills write dates day first.',
          'category is one of travel, food, software, equipment, rent, other. Restaurants and cafés are food.',
          'Check that the subtotal and GST add up to the total. Say so in one short, plain sentence. Do not judge the GSTIN; the app checks it.',
          'Do not record, create or send anything. A human confirms the bill first.',
        ],
        output_format: {
          seller_name: 'string|null',
          seller_gstin: 'string|null',
          seller_state: 'string|null',
          bill_date: 'YYYY-MM-DD|null',
          category: 'travel|food|software|equipment|rent|other|null',
          subtotal_rupees: 'number|null',
          cgst_rupees: 'number|null',
          sgst_rupees: 'number|null',
          igst_rupees: 'number|null',
          total_rupees: 'number|null',
          check: 'string|null',
        },
      },
      context: { human_approval: 'required_before_save' },
    },
    20_000,
  )
  const parsed = AgentBill.safeParse(result.output)
  // A run that failed, or came back as prose, has neither of these.
  if (!parsed.success || (!parsed.data.seller_name && parsed.data.total_rupees == null)) return null
  const { check, ...fields } = parsed.data
  return { fields, check: check ?? null, runId: result.run_id ?? null, status: result.status }
}
