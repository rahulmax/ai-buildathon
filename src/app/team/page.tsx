import { createHash, timingSafeEqual } from 'node:crypto'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CircleCheck } from 'lucide-react'
import { Back } from '@/components/back'
import { db } from '@/lib/db'
import { currentWorkspace } from '@/lib/workspace'

export const dynamic = 'force-dynamic'

const digest = (s: string) => createHash('sha256').update(s).digest()

// Only the team knows TEAM_KEY. Unset or wrong, this page doesn't exist.
function keyMatches(key: string | string[] | undefined) {
  const expected = process.env.TEAM_KEY
  if (!expected || typeof key !== 'string') return false
  return timingSafeEqual(digest(key), digest(expected))
}

// /team?key=... flags the workspace on this device as the team's own, so
// /stats leaves it out. Add &off=1 to undo.
export default async function TeamPage({ searchParams }: PageProps<'/team'>) {
  const { key, off } = await searchParams
  if (!keyMatches(key)) notFound()

  const ws = await currentWorkspace()
  if (!ws) {
    return (
      <main className="shell stagger gap-6 py-6">
        <Back />
        <p className="card rise p-5 text-sm">No workspace on this device yet. Set one up, then open this link again.</p>
      </main>
    )
  }

  const isTeam = off !== '1'
  const sql = await db()
  await sql`update workspace set is_team = ${isTeam} where id = ${ws.id}`

  return (
    <main className="shell stagger gap-6 py-6">
      <Back />
      <div className="card rise flex items-start gap-3 p-5">
        <CircleCheck className="mt-0.5 size-5 shrink-0 text-ok-700" />
        <div className="flex flex-col gap-1">
          <p className="font-semibold">{isTeam ? `${ws.name} is marked as team` : `${ws.name} counts again`}</p>
          <p className="text-sm text-muted-foreground">
            {isTeam ? 'The stats page leaves it out.' : 'The stats page includes it.'}
          </p>
        </div>
      </div>
      <Link href="/stats" className="rise self-start text-sm font-medium text-primary hover:underline hover:underline-offset-2">
        See today&apos;s stats
      </Link>
    </main>
  )
}
