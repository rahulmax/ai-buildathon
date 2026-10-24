import { readBill } from '@/lib/claude'

export const maxDuration = 60

const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const

export async function POST(req: Request) {
  const form = await req.formData()
  const photo = form.get('photo')
  if (!(photo instanceof Blob) || photo.size === 0) {
    return Response.json({ error: 'No photo' }, { status: 400 })
  }
  const type = TYPES.find((t) => t === photo.type)
  if (!type) return Response.json({ error: 'Use a JPEG or PNG photo' }, { status: 400 })
  if (photo.size > 5 * 1024 * 1024) return Response.json({ error: 'Photo is too large' }, { status: 413 })
  try {
    // The photo is read and dropped. Only the fields are kept.
    const base64 = Buffer.from(await photo.arrayBuffer()).toString('base64')
    return Response.json(await readBill(base64, type))
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Couldn’t read that bill. Fill it in below.' }, { status: 502 })
  }
}
