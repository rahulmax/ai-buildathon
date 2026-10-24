import { Back } from '@/components/back'
import { DetailsForm } from '@/components/details-form'
import { requireWorkspace, workspaceServices } from '@/lib/workspace'

export default async function SettingsPage() {
  const ws = await requireWorkspace()
  const services = await workspaceServices(ws.id)

  return (
    <main className="shell stagger gap-6 py-6">
      <Back />
      <div className="rise flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Your details</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          These go on every new invoice. Invoices you’ve already sent keep the details they went out with.
        </p>
      </div>
      <div className="card rise p-5">
        <DetailsForm
          initial={{ name: ws.name, state: ws.state, upi_id: ws.upi_id, gstin: ws.gstin, services }}
        />
      </div>
    </main>
  )
}
