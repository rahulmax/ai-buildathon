import { SaveEmailCard } from '@/components/save-email-card'
import { emailEnabled } from '@/lib/email'
import { hasSavedAnything, saveEmailSkipped, type Workspace } from '@/lib/workspace'

// "Keep your books?" shows after the first saved invoice or bill, until the
// email is verified or this browser says not now.
export async function SaveEmail({ ws }: { ws: Workspace }) {
  if (ws.email || !emailEnabled() || (await saveEmailSkipped())) return null
  if (!(await hasSavedAnything(ws.id))) return null
  return (
    <div className="rise">
      <SaveEmailCard />
    </div>
  )
}
