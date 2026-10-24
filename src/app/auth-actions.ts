'use server'

import { z } from 'zod'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { emailEnabled } from '@/lib/email'
import { emailLink, workspaceForEmail } from '@/lib/magic-link'
import { COOKIE, SKIP_SAVE_EMAIL, currentWorkspace } from '@/lib/workspace'

export type EmailState = { error?: string; sent?: boolean } | undefined

const Email = z.string().trim().toLowerCase().max(254).pipe(z.email('Enter a valid email'))

// Not you? Start fresh: this browser forgets the workspace. The books stay in the database.
export async function startFresh() {
  const jar = await cookies()
  jar.delete(COOKIE)
  jar.delete(SKIP_SAVE_EMAIL)
  redirect('/start')
}

// Not now on the "Keep your books?" card. Remembered per browser.
export async function skipSaveEmail() {
  ;(await cookies()).set(SKIP_SAVE_EMAIL, '1', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  })
  revalidatePath('/')
}

// Keep your books: email a link, and attach the email only when it's clicked.
// If the email already has books, the link signs into those instead. The reply
// is the same either way, so it never says whose email it is.
export async function saveEmail(_: EmailState, form: FormData): Promise<EmailState> {
  if (!emailEnabled()) return { error: 'Email isn’t set up yet.' }
  const ws = await currentWorkspace()
  if (!ws) redirect('/start')
  const email = Email.safeParse(form.get('email') ?? '')
  if (!email.success) return { error: email.error.issues[0].message }
  const owner = await workspaceForEmail(email.data)
  try {
    if (owner) await emailLink({ workspaceId: owner, to: email.data, attach: null })
    else await emailLink({ workspaceId: ws.id, to: email.data, attach: email.data })
  } catch (e) {
    console.error('Couldn’t send the save-email link', e)
    return { error: 'Couldn’t send the email. Try again.' }
  }
  return { sent: true }
}

// Sign in on a new device. Always the same reply, whether or not the email has books.
export async function requestSignIn(_: EmailState, form: FormData): Promise<EmailState> {
  if (!emailEnabled()) return { error: 'Email isn’t set up yet.' }
  const email = Email.safeParse(form.get('email') ?? '')
  if (!email.success) return { error: email.error.issues[0].message }
  const owner = await workspaceForEmail(email.data)
  if (owner) {
    try {
      await emailLink({ workspaceId: owner, to: email.data, attach: null })
    } catch (e) {
      console.error('Couldn’t send the sign-in link', e)
    }
  }
  return { sent: true }
}
