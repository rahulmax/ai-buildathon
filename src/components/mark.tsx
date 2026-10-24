const SIZES = {
  sm: 'text-base',
  md: 'text-xl',
  lg: 'text-2xl',
}

// The wordmark. No symbol until there's a real logo.
export function Mark({ size = 'md' }: { size?: keyof typeof SIZES }) {
  return <span className={`font-semibold tracking-tight ${SIZES[size]}`}>Hisab</span>
}
