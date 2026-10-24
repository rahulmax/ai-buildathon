import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { db } from './db'

export const COOKIE = 'wid'
// Set when someone taps "Not now" on the "Keep your books?" card.
export const SKIP_SAVE_EMAIL = 'skip_save_email'

export type Workspace = {
  id: string
  name: string
  state: string
  gstin: string | null
  upi_id: string
  email: string | null
}

const UUID = /^[0-9a-f-]{36}$/

export async function currentWorkspace(): Promise<Workspace | null> {
  return workspaceById((await cookies()).get(COOKIE)?.value)
}

export async function workspaceById(id: string | undefined): Promise<Workspace | null> {
  if (!id || !UUID.test(id)) return null
  const sql = await db()
  const [ws] = await sql<Workspace[]>`
    select id, name, state, gstin, upi_id, email from workspace where id = ${id}`
  return ws ?? null
}

export type WorkspaceService = { name: string; kind: 'service' | 'goods'; code: string | null }

export async function workspaceServices(workspaceId: string) {
  const sql = await db()
  return sql<WorkspaceService[]>`
    select name, kind, code from workspace_service where workspace_id = ${workspaceId} order by created_at, name`
}

// No sign-up: the first visit fills in details, and the cookie is the account.
export async function requireWorkspace() {
  const ws = await currentWorkspace()
  if (!ws) redirect('/start')
  return ws
}

// The cookie is set the same way on setup and on a magic-link sign-in.
export async function setWorkspaceCookie(id: string) {
  ;(await cookies()).set(COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  })
}

export async function saveEmailSkipped() {
  return (await cookies()).has(SKIP_SAVE_EMAIL)
}

// Has the workspace saved at least one invoice or bill? Gates the "Keep your books?" prompt.
export async function hasSavedAnything(workspaceId: string) {
  const sql = await db()
  const [row] = await sql<{ saved: boolean }[]>`
    select exists (select 1 from invoice where workspace_id = ${workspaceId})
      or exists (select 1 from bill where workspace_id = ${workspaceId}) as saved`
  return row.saved
}
