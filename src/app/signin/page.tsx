import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Back } from '@/components/back'
import { Mark } from '@/components/mark'
import { SignInForm } from '@/components/signin-form'
import { emailEnabled } from '@/lib/email'

export default async function SignInPage({ searchParams }: PageProps<'/signin'>) {
  if (!emailEnabled()) redirect('/start')
  const { expired } = await searchParams
  return (
    <main className="shell stagger gap-8 py-10">
      <Back />
      <div className="rise flex flex-col gap-4">
        <Mark size="lg" />
        <h1 className="text-4xl font-semibold">Get a link to your books.</h1>
        <p className="leading-relaxed text-muted-foreground">
          Enter the email you saved your books with. We’ll send a link that opens them on this phone.
        </p>
      </div>
      {expired && (
        <p className="rise rounded-xl border border-warn-200 bg-warn-50 px-4 py-3 text-sm text-warn-800">
          That link has expired or was already used. Get a new one below.
        </p>
      )}
      <div className="card rise p-5">
        <SignInForm />
      </div>
      <p className="rise text-sm text-muted-foreground">
        New here?{' '}
        <Link href="/start" className="font-medium text-primary underline-offset-4 hover:underline">
          Set up in a minute
        </Link>
      </p>
    </main>
  )
}
