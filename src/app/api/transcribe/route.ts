import { transcribe } from '@/lib/elevenlabs'

export const maxDuration = 60

export async function POST(req: Request) {
  const form = await req.formData()
  const audio = form.get('audio')
  if (!(audio instanceof Blob) || audio.size === 0) {
    return Response.json({ error: 'No audio' }, { status: 400 })
  }
  try {
    return Response.json(await transcribe(audio, 'invoice.webm'))
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Couldn’t hear that. Try again, a little closer to the mic.' }, { status: 502 })
  }
}
