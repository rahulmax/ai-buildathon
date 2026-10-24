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
        <h1 className="text-4xl font-semibold">Say it, get paid.</h1>
        <p className="leading-relaxed text-muted-foreground">
          Say an invoice in English, Hindi, Kannada or Malayalam. These go on every invoice you send. No sign-up.
        </p>
      </div>
      <div className="card rise p-5">
        <DetailsForm />
      </div>
      {emailEnabled() && (
        <p className="rise text-center">
          <Link href="/signin" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            Have books already? Sign in
          </Link>
        </p>
      )}
    </main>
  )
}
