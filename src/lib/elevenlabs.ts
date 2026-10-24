import 'server-only'

// ElevenLabs Scribe: audio in, text and detected language out.
export async function transcribe(audio: Blob, filename: string) {
  const form = new FormData()
  form.append('model_id', process.env.ELEVENLABS_STT_MODEL ?? 'scribe_v1')
  form.append('file', audio, filename)
  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY! },
    body: form,
  })
  if (!res.ok) throw new Error(`Scribe ${res.status}: ${await res.text()}`)
  const data = (await res.json()) as { text: string; language_code?: string }
  return { text: data.text.trim(), language: data.language_code ?? null }
}
