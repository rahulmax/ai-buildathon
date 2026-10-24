import { z } from 'zod'
import { pickCodes } from '@/lib/claude'
import { lookup, SAC, shortlistHsn } from '@/lib/hsn'

export const maxDuration = 60

const Body = z.object({ services: z.array(z.string().trim().min(2).max(120)).min(1).max(10) })

export type CodeOption = { code: string; desc: string }
export type ServiceCodes = { service: string; kind: 'service' | 'goods'; options: CodeOption[] }

export async function POST(req: Request) {
  const body = Body.safeParse(await req.json())
  if (!body.success) return Response.json({ error: 'List at least one thing you sell' }, { status: 400 })
  const services = body.data.services
  const shortlists = Object.fromEntries(services.map((s) => [s, shortlistHsn(s)]))
  try {
    const items = await pickCodes(services, SAC, shortlists)
    const result: ServiceCodes[] = services.map((service, i) => {
      const item = items.find((x) => x.service.toLowerCase() === service.toLowerCase()) ?? items[i]
      // Keep only codes that exist in the official list.
      const options = [item?.code, ...(item?.alternatives ?? [])]
        .filter((c): c is string => Boolean(c))
        .map((c) => lookup(c))
        .filter((c): c is CodeOption => Boolean(c))
        .filter((c, j, all) => all.findIndex((x) => x.code === c.code) === j)
      return { service, kind: item?.kind ?? 'service', options }
    })
    return Response.json({ items: result })
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Couldn’t look up codes right now. Try again.' }, { status: 502 })
  }
}
