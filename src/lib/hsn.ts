import 'server-only'
import sacData from '@/data/sac.json'
import hsnData from '@/data/hsn.json'

// The official HSN/SAC master from the GST portal (tutorial.gst.gov.in/downloads/HSN_SAC.xlsx).
export type Code = { code: string; desc: string }

export const SAC: Code[] = (sacData as Code[]).filter((c) => c.code.length === 6)
const HSN: Code[] = (hsnData as Code[]).filter((c) => c.code.length >= 4)
const ALL = new Map([...SAC, ...HSN].map((c) => [c.code, c]))

export const lookup = (code: string) => ALL.get(code) ?? null

const STOP = new Set(['and', 'the', 'of', 'for', 'or', 'in', 'to', 'a', 'services', 'service', 'other', 'my', 'i'])
const words = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w))

// Goods have 21,000 codes, too many to hand the model. Shortlist by word overlap.
export function shortlistHsn(query: string, n = 40) {
  const q = words(query)
  if (!q.length) return []
  return HSN.map((c) => {
    const d = c.desc.toLowerCase()
    const score = q.reduce((s, w) => s + (d.includes(w) ? 1 : d.includes(w.slice(0, -1)) ? 0.5 : 0), 0)
    return { c, score: score + (c.code.length === 8 ? 0.1 : 0) }
  })
    .filter((x) => x.score >= 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((x) => x.c)
}
