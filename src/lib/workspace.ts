import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { db } from './db'

export const COOKIE = 'wid'

export type Workspace = {
  id: string
  name: string
  state: string
  gstin: string | null
  upi_id: string
}

const UUID = /^[0-9a-f-]{36}$/

export async function currentWorkspace(): Promise<Workspace | null> {
  const id = (await cookies()).get(COOKIE)?.value
  if (!id || !UUID.test(id)) return null
  const sql = await db()
  const [ws] = await sql<Workspace[]>`
    select id, name, state, gstin, upi_id from workspace where id = ${id}`
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
