import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { agenticOrgReady, runCollectionsAgent, type ChaseResult } from '@/lib/agenticorg'
import { draftReminder } from '@/lib/claude'
import { daysBetween, formatDate, todayIST } from '@/lib/dates'
import { formatINR, rupeesString } from '@/lib/money'
import { ensurePayLink, syncPayLink } from '@/lib/pinelabs'
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
    select i.id, i.number, i.total, i.status, i.due_date, i.issue_date, i.public_slug, i.pay_link,
      c.name as customer_name, c.phone
    from invoice i join customer c on c.id = i.customer_id
    where i.id = ${body.data.invoiceId} and i.workspace_id = ${ws.id} and i.status = 'open'`
  if (!inv) return Response.json({ error: 'Invoice not found' }, { status: 404 })

  // Don't chase money that already came in through the gateway.
  if (await syncPayLink({ id: inv.id, status: inv.status, pay_link: inv.pay_link })) {
    revalidatePath('/', 'layout')
    return Response.json({ error: 'Already paid through Pine Labs.' }, { status: 409 })
  }

  const origin = new URL(req.url).origin
  const invoiceUrl = `${origin}/i/${inv.public_slug}`
  const daysOverdue = daysBetween(inv.due_date ?? inv.issue_date, todayIST())
  const amount = formatINR(inv.total)

  // One way to pay (OQ-INV-8): the invoice's Pine Labs link, or the invoice page with its UPI QR.
  const payLink = await ensurePayLink(
    { id: inv.id, number: inv.number, total: inv.total, status: inv.status, pay_link: inv.pay_link, seller_name: ws.name },
    invoiceUrl,
    8_000,
  )
  const link = payLink ?? invoiceUrl

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
        payLink: link,
        gateway: Boolean(payLink),
      })
    } catch (e) {
      console.error('AgenticOrg collections agent failed', e)
      agentError = e instanceof Error ? e.message : String(e)
    }
  }

  // Reminders are always English (OQ-INV-7). The agent's draft only counts if it carries our link.
  const agentMessage = agent?.message && agent.message.includes(link) ? agent.message : null
  let claudeMessage: string | null = null
  if (!agentMessage) {
    try {
      claudeMessage = await draftReminder({
        sellerName: ws.name,
        customerName: inv.customer_name,
        invoiceNumber: inv.number,
        amount,
        daysOverdue,
        link,
      })
      if (claudeMessage && !claudeMessage.includes(link)) claudeMessage = `${claudeMessage}\n\n${link}`
    } catch (e) {
      console.error('Claude reminder failed', e)
    }
  }
  const message =
    agentMessage ??
    claudeMessage ??
    `Hi ${inv.customer_name}, a reminder for invoice ${inv.number} of ${amount}. You can pay here:\n${link}\n\nThanks, ${ws.name}`

  const source = agentMessage ? 'agenticorg' : 'claude'
  await sql`
    insert into chase (invoice_id, source, message, payment_link, agent_run_id, trace)
    values (${inv.id}, ${source}, ${message}, ${payLink}, ${agent?.runId ?? null},
      ${sql.json({ agent, agentError } as never)})`

  return Response.json({
    message,
    link,
    phone: inv.phone,
    source,
    gateway: Boolean(payLink),
    daysOverdue,
    agent: agent && {
      runId: agent.runId,
      status: agent.status,
      tone: agent.tone,
      confidence: agent.confidence,
      toolCalls: agent.toolCalls,
      hitl: agent.hitl,
    },
    agentError,
  })
}
