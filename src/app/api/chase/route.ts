import { z } from 'zod'
import { db } from '@/lib/db'
import { agenticOrgReady, runCollectionsAgent, type ChaseResult } from '@/lib/agenticorg'
import { draftReminder, languageName } from '@/lib/claude'
import { daysBetween, formatDate, todayIST } from '@/lib/dates'
import { formatINR, rupeesString } from '@/lib/money'
import { upiLink } from '@/lib/upi'
import { currentWorkspace } from '@/lib/workspace'

export const maxDuration = 60

const Body = z.object({ invoiceId: z.string().uuid() })

export async function POST(req: Request) {
  const ws = await currentWorkspace()
  if (!ws) return Response.json({ error: 'No workspace' }, { status: 401 })
  const body = Body.safeParse(await req.json())
  if (!body.success) return Response.json({ error: 'Bad request' }, { status: 400 })

  const sql = await db()
  const [inv] = await sql`
    select i.id, i.number, i.total, i.due_date, i.issue_date, i.public_slug, i.language,
      c.name as customer_name, c.phone
    from invoice i join customer c on c.id = i.customer_id
    where i.id = ${body.data.invoiceId} and i.workspace_id = ${ws.id} and i.status = 'open'`
  if (!inv) return Response.json({ error: 'Invoice not found' }, { status: 404 })

  const origin = new URL(req.url).origin
  const invoiceUrl = `${origin}/i/${inv.public_slug}`
  const daysOverdue = daysBetween(inv.due_date ?? inv.issue_date, todayIST())
  const language = languageName(inv.language)
  const amount = formatINR(inv.total)

  let agent: ChaseResult | null = null
  let agentError: string | null = null
  if (agenticOrgReady()) {
    try {
      agent = await runCollectionsAgent({
        sellerName: ws.name,
        invoiceNumber: inv.number,
        customerName: inv.customer_name,
        customerPhone: inv.phone,
        amountRupees: rupeesString(inv.total),
        dueDate: inv.due_date ? formatDate(inv.due_date) : null,
        daysOverdue,
        invoiceUrl,
        upiLink: upiLink({ upiId: ws.upi_id, payee: ws.name, amount: inv.total, note: inv.number }),
        language,
      })
    } catch (e) {
      console.error('AgenticOrg collections agent failed', e)
      agentError = e instanceof Error ? e.message : String(e)
    }
  }

  // The link the customer pays from: Pine Labs if the agent made one, else our invoice page with UPI.
  const link = agent?.paymentLink ?? invoiceUrl
  const message =
    (agent?.message && agent.message.includes('http') ? agent.message : null) ??
    (await draftReminder({
      sellerName: ws.name,
      customerName: inv.customer_name,
      invoiceNumber: inv.number,
      amount,
      daysOverdue,
      link,
      language,
    })) ??
    `Hi ${inv.customer_name}, a reminder for invoice ${inv.number} of ${amount}. You can pay here:\n${link}\n\nThanks, ${ws.name}`

  const source = agent ? 'agenticorg' : 'claude'
  await sql`
    insert into chase (invoice_id, source, message, payment_link, agent_run_id, trace)
    values (${inv.id}, ${source}, ${message}, ${agent?.paymentLink ?? null}, ${agent?.runId ?? null},
      ${sql.json({ agent, agentError } as never)})`

  return Response.json({
    message,
    link,
    phone: inv.phone,
    source,
    daysOverdue,
    agent: agent && {
      runId: agent.runId,
      status: agent.status,
      tone: agent.tone,
      confidence: agent.confidence,
      toolCalls: agent.toolCalls,
      paymentLink: agent.paymentLink,
      hitl: agent.hitl,
    },
    agentError,
  })
}
