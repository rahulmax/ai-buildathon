import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export function Back({ href = '/', label = 'Home' }: { href?: string; label?: string }) {
  return (
    <Link href={href} className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground">
      <ChevronLeft className="size-4" /> {label}
    </Link>
  )
}
