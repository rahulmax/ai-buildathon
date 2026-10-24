import { z } from 'zod'
import { extractInvoice } from '@/lib/claude'
import { todayIST } from '@/lib/dates'
import { currentWorkspace, workspaceServices } from '@/lib/workspace'

export const maxDuration = 60

const Body = z.object({ transcript: z.string().min(1).max(4000) })

export async function POST(req: Request) {
  const ws = await currentWorkspace()
  if (!ws) return Response.json({ error: 'No workspace' }, { status: 401 })
  const body = Body.safeParse(await req.json())
  if (!body.success) return Response.json({ error: 'No transcript' }, { status: 400 })
  const services = ws ? await workspaceServices(ws.id) : []
  try {
    return Response.json(await extractInvoice(body.data.transcript, todayIST(), services.map((s) => s.name)))
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Couldn’t read the invoice from that. Fill it in below.' }, { status: 502 })
  }
}
