import { agenticOrgReady, runBillReader } from '@/lib/agenticorg'
import { readBill } from '@/lib/claude'
import { BillExtract, type BillRead, type BillReading } from '@/lib/schemas'
import { currentWorkspace } from '@/lib/workspace'

export const maxDuration = 60

const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'] as const
const FIELDS = Object.keys(BillExtract.shape) as (keyof BillExtract)[]

export async function POST(req: Request) {
  if (!(await currentWorkspace())) return Response.json({ error: 'No workspace' }, { status: 401 })
  const form = await req.formData()
  const photo = form.get('photo')
  if (!(photo instanceof Blob) || photo.size === 0) {
    return Response.json({ error: 'No photo' }, { status: 400 })
  }
  const type = TYPES.find((t) => t === photo.type)
  if (!type) return Response.json({ error: 'Use a photo or a PDF of the bill' }, { status: 400 })
  if (photo.size > 5 * 1024 * 1024) return Response.json({ error: 'That file is too large' }, { status: 413 })

  let read: BillRead
  try {
    // The photo is read and dropped. Only the fields are kept.
    const base64 = Buffer.from(await photo.arrayBuffer()).toString('base64')
    read = await readBill(base64, type)
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Couldn’t read that bill. Fill it in below.' }, { status: 502 })
  }
  const { text, ...claude } = read

  // Claude reads the photo; the AgenticOrg Bill reader reads the fields off its text and checks
  // the GST. Its fields win, Claude fills any it left empty. If the agent fails, Claude's read stands.
  let reading: BillReading = { ...claude, source: 'claude', check: null }
  if (agenticOrgReady() && text) {
    try {
      const agent = await runBillReader(text)
      if (agent) {
        const fields = Object.fromEntries(FIELDS.map((k) => [k, agent.fields[k] ?? claude[k]])) as BillExtract
        reading = { ...fields, source: 'agenticorg', check: agent.check }
      }
    } catch (e) {
      console.error('AgenticOrg Bill reader failed, using Claude’s read', e)
    }
  }
  return Response.json(reading)
}
