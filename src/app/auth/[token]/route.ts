import { redirect } from 'next/navigation'
import { redeemLink } from '@/lib/magic-link'
import { setWorkspaceCookie } from '@/lib/workspace'

// The magic link from the email. Sets the workspace cookie and goes home.
// Expired, used or unknown: back to /signin to get a new one.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const workspaceId = await redeemLink(token)
  if (!workspaceId) redirect('/signin?expired=1')
  await setWorkspaceCookie(workspaceId)
  redirect('/')
}

// Link scanners send HEAD. Without this, Next answers HEAD with GET and the link is used up.
export function HEAD() {
  return new Response(null, { status: 200 })
}
