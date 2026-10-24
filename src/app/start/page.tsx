import { redirect } from 'next/navigation'
import { DetailsForm } from '@/components/details-form'
import { currentWorkspace } from '@/lib/workspace'

export default async function StartPage() {
  if (await currentWorkspace()) redirect('/')
  return (
    <main className="shell gap-8 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Say it, get paid.</h1>
        <p className="text-muted-foreground">
          Say an invoice in English, Hindi, Kannada or Malayalam. These go on every invoice you send. No sign-up.
        </p>
      </div>
      <DetailsForm />
    </main>
  )
}
