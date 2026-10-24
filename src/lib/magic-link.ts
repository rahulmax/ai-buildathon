import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { headers } from 'next/headers'
import { db } from './db'
import { sendMagicLink } from './email'

// A magic link is 32 random bytes, base64url. Only its SHA-256 is stored.
// It expires in 30 minutes and works once.

const hash = (token: string) => createHash('sha256').update(token).digest('hex')
const TOKEN = /^[A-Za-z0-9_-]{43}$/

// APP_URL pins the link origin (set it in production). Without it, the origin
// comes from the request's forwarded host and protocol, as the host sees them.
async function origin() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '')
  const h = await headers()
  const host = (h.get('x-forwarded-host') ?? h.get('host'))?.split(',')[0].trim()
  const proto =
    h.get('x-forwarded-proto')?.split(',')[0].trim() ?? (process.env.NODE_ENV === 'production' ? 'https' : 'http')
  return `${proto}://${host}`
}

export async function workspaceForEmail(email: string) {
  const sql = await db()
  const [ws] = await sql<{ id: string }[]>`select id from workspace where lower(email) = lower(${email})`
  return ws?.id ?? null
}

// Email a link that signs into the workspace. `attach` is saved as the
// workspace's email once the link is clicked (null for a plain sign-in).
export async function emailLink({ workspaceId, to, attach }: { workspaceId: string; to: string; attach: string | null }) {
  const sql = await db()
  // A light throttle, so one workspace can't be used to flood an inbox.
  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from magic_link
    where workspace_id = ${workspaceId} and created_at > now() - interval '15 minutes'`
  if (n >= 5) return
  const token = randomBytes(32).toString('base64url')
  await sql`
    insert into magic_link (workspace_id, token_hash, expires_at, email)
    values (${workspaceId}, ${hash(token)}, now() + interval '30 minutes', ${attach})`
  await sendMagicLink({ to, url: `${await origin()}/auth/${token}`, saving: Boolean(attach) })
}

// Use the link: mark it used in the same statement that checks it, so it works once.
// Returns the workspace to sign into, or null if the link is unknown, used or expired.
export async function redeemLink(token: string) {
  if (!TOKEN.test(token)) return null
  const sql = await db()
  const [link] = await sql<{ workspace_id: string; email: string | null }[]>`
    update magic_link set used_at = now()
    where token_hash = ${hash(token)} and used_at is null and expires_at > now()
    returning workspace_id, email`
  if (!link) return null
  if (link.email) {
    // Clicking proves the email. Skip it if another workspace verified it first.
    try {
      await sql`
        update workspace set email = ${link.email}
        where id = ${link.workspace_id}
          and not exists (
            select 1 from workspace where lower(email) = lower(${link.email}) and id <> ${link.workspace_id})`
    } catch (e) {
      console.error('Couldn’t save the email on the workspace', e)
    }
  }
  return link.workspace_id
}
