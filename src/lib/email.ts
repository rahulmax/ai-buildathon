import 'server-only'

// Email goes through Resend's REST API. Needs RESEND_API_KEY and EMAIL_FROM,
// e.g. EMAIL_FROM="Hisab <hello@yourdomain.in>".

export function emailReady() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)
}

// Without Resend the email feature is hidden in production. In development the
// link is logged to the server console instead, so it can still be tested.
export function emailEnabled() {
  return emailReady() || process.env.NODE_ENV !== 'production'
}

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export async function sendMagicLink({ to, url, saving }: { to: string; url: string; saving: boolean }) {
  const subject = saving ? 'Keep your books: confirm your email' : 'Your link to your books'
  const lead = saving
    ? 'Tap the link to save your books to this email. Then you can open them on any phone.'
    : 'Tap the link to open your books.'
  const text = `${lead}\n\n${url}\n\nThe link expires in 30 minutes and works once. If you didn’t ask for it, ignore this email.\n\nHisab`
  const html = `<p>${escape(lead)}</p>
<p><a href="${escape(url)}">Open my books</a></p>
<p>The link expires in 30 minutes and works once. If you didn’t ask for it, ignore this email.</p>
<p>Hisab</p>`

  if (!emailReady()) {
    console.log(`[email] Magic link for ${to}: ${url}`)
    return
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text, html }),
  })
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`)
}
