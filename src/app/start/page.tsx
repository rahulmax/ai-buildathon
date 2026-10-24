import Link from 'next/link'
import { redirect } from 'next/navigation'
import { DetailsForm } from '@/components/details-form'
import { Mark } from '@/components/mark'
import { emailEnabled } from '@/lib/email'
import { currentWorkspace } from '@/lib/workspace'

export default async function StartPage() {
  if (await currentWorkspace()) redirect('/')
  return (
    <main className="shell stagger gap-8 py-10">
      <div className="rise flex flex-col gap-4">
        <Mark size="lg" />
        <h1 className="text-4xl font-semibold">Set up your billing profile</h1>
        <p className="leading-relaxed text-muted-foreground">
          Enter the business details and UPI ID that will appear on your GST invoices. We will automatically match your
          services to official HSN and SAC codes.
        </p>
      </div>
      <div className="card rise p-5">
        <DetailsForm />
      </div>
      {emailEnabled() && (
        <p className="rise text-center">
          <Link href="/signin" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            Already have a workspace? Sign in
          </Link>
        </p>
      )}
    </main>
  )
}
