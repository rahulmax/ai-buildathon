// Customer matching, shared by the confirm form and createInvoice.
// People say the same customer many ways: "Acme", "ACME Pvt. Ltd.", "Acme Private Limited".

export type CustomerOption = {
  id: string
  name: string
  state: string | null
  phone: string | null
  gstin: string | null
}

const SUFFIXES = /\b(pvt|private|ltd|limited|llp|inc|corp|co|company|and|the)\b/g

export function normaliseName(name: string) {
  const base = name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
  const stripped = base.replace(SUFFIXES, ' ').replace(/\s+/g, ' ').trim()
  return stripped || base.replace(/\s+/g, ' ').trim()
}

// Last 10 digits, so +91 98765 43210 and 9876543210 match.
export const phoneKey = (phone: string) => phone.replace(/\D/g, '').slice(-10)

function editDistance(a: string, b: string) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = row
  }
  return prev[b.length]
}

// How alike two names are, 0 to 1, and whether that's close enough to ask.
function similarity(a: string, b: string) {
  const x = normaliseName(a)
  const y = normaliseName(b)
  if (!x || !y) return { score: 0, close: false }
  if (x === y) return { score: 1, close: true }
  const ta = new Set(x.split(' '))
  const tb = new Set(y.split(' '))
  const shared = [...ta].filter((t) => tb.has(t)).length
  const tokens = shared / new Set([...ta, ...tb]).size
  const chars = 1 - editDistance(x, y) / Math.max(x.length, y.length)
  return { score: Math.max(tokens, chars), close: tokens >= 0.5 || chars >= 0.8 }
}

// The existing customer this name probably means, when it isn't an exact match.
// An exact (case-insensitive) match needs no question: the server reuses it.
export function closeCustomer(name: string, customers: CustomerOption[]) {
  const typed = name.trim().toLowerCase()
  if (!typed || customers.some((c) => c.name.trim().toLowerCase() === typed)) return null
  let best: { customer: CustomerOption; score: number } | null = null
  for (const c of customers) {
    const s = similarity(name, c.name)
    if (s.close && (!best || s.score > best.score)) best = { customer: c, score: s.score }
  }
  return best?.customer ?? null
}
