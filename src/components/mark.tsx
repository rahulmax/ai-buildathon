import { IndianRupee } from 'lucide-react'

export function Mark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lift ${
        size === 'lg' ? 'size-12' : 'size-10'
      }`}
    >
      <IndianRupee className={size === 'lg' ? 'size-6' : 'size-5'} strokeWidth={2.25} />
    </span>
  )
}
