import { IndianRupee } from 'lucide-react'

const SIZES = {
  sm: { box: 'size-7 rounded-lg', icon: 'size-3.5' },
  md: { box: 'size-10 rounded-xl', icon: 'size-5' },
  lg: { box: 'size-12 rounded-xl', icon: 'size-6' },
}

export function Mark({ size = 'md' }: { size?: keyof typeof SIZES }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center bg-primary text-primary-foreground shadow-lift ${SIZES[size].box}`}
    >
      <IndianRupee className={SIZES[size].icon} strokeWidth={2.25} />
    </span>
  )
}
