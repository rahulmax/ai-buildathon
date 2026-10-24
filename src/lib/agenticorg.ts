import 'server-only'

const BASE_URL = process.env.AGENTICORG_BASE_URL ?? 'https://agenticorg.hackathon.pinelabs.com'
const API = `${BASE_URL}/api/v1`

// "Say it get paid: Collections" in our AgenticOrg org.
const COLLECTIONS_AGENT_ID = process.env.AGENTICORG_COLLECTIONS_AGENT_ID ?? 'c17ea5b6-f3de-4f23-91c0-2894d4311779'

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
async function runAgent(agentId: string, body: unknown): Promise<AgentRunResult> {
  const res = await fetch(`${API}/agents/${agentId}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.AGENTICORG_API_KEY}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
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
  upiLink: string
  language: string
}

export type ChaseResult = {
  message: string | null
  paymentLink: string | null
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

// Only a real Pine Labs link counts. Without Plural keys the agent hands back our own invoice URL.
const PINE = /pinelabs|plural|pinepg/i

function findUrl(obj: unknown) {
  const direct = pick(obj, ['payment_link', 'paymentLink', 'short_url', 'link', 'url', 'payment_url'])
  if (direct?.startsWith('http') && PINE.test(direct)) return direct
  const text = JSON.stringify(obj ?? {})
  return text.match(/https:\/\/[^"\s\\]*(pinelabs|plural|pinepg)[^"\s\\]*/i)?.[0] ?? null
}

// The collections agent: decides the tone from how late the invoice is,
// creates a Pine Labs payment link, and drafts the reminder. A human approves
// before anything is sent.
export async function runCollectionsAgent(input: ChaseInput): Promise<ChaseResult> {
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
        upi_link: input.upiLink,
      },
      steps: [
        `Create a Pine Labs payment link for INR ${input.amountRupees} referencing ${input.invoiceNumber}. If you cannot, the link is ${input.invoiceUrl}, which shows the invoice with a UPI QR.`,
        `Pick a tone from days_overdue: 0 or less is a friendly heads-up, 1 to 14 is a polite reminder, over 14 is firm but courteous.`,
        `Draft a short WhatsApp reminder in ${input.language}, from ${input.sellerName}, with the amount, the invoice number and the link written out in full. Never a placeholder like [Payment Link]. Under 60 words, no subject line.`,
        'Do not send anything. A human approves the message first.',
      ],
      output_format: { message: 'string', payment_link: 'string', tone: 'string' },
    },
    context: {
      seller_name: input.sellerName,
      channel: 'whatsapp',
      human_approval: 'required_before_send',
    },
  })

  return {
    message: pick(result.output, ['message', 'reminder', 'whatsapp_message', 'draft', 'body', 'text']),
    paymentLink: findUrl(result.output) ?? findUrl(result.tool_calls),
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
