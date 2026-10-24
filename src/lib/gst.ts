export const GST_RATES = [0, 5, 12, 18, 28] as const

export const STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam',
  'Bihar', 'Chandigarh', 'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir',
  'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
  'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
] as const

export type Split = { cgst: number; sgst: number; igst: number }

// Same state as the place of supply: CGST and SGST, half each.
// Different states: IGST.
export function splitGst(gst: number, supplierState: string, placeOfSupply: string): Split {
  if (supplierState === placeOfSupply) {
    const cgst = Math.floor(gst / 2)
    return { cgst, sgst: gst - cgst, igst: 0 }
  }
  return { cgst: 0, sgst: 0, igst: gst }
}

export type LineInput = { description: string; quantity: number; rate: number; gstRate: number }

export function totals(lines: LineInput[], supplierState: string, placeOfSupply: string) {
  const priced = lines.map((l) => {
    const amount = Math.round(l.quantity * l.rate)
    return { ...l, amount, gst: Math.round((amount * l.gstRate) / 100) }
  })
  const subtotal = priced.reduce((s, l) => s + l.amount, 0)
  const gst = priced.reduce((s, l) => s + l.gst, 0)
  const split = splitGst(gst, supplierState, placeOfSupply)
  return { lines: priced, subtotal, gst, ...split, total: subtotal + gst }
}

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

export const isGstin = (s: string) => GSTIN.test(s.trim().toUpperCase())

// Financial year runs April to March. Oct 2026 is FY 26-27, written 2627.
export function fyCode(date = new Date()) {
  const y = date.getFullYear() % 100
  const start = date.getMonth() >= 3 ? y : y - 1
  return `${String(start).padStart(2, '0')}${String(start + 1).padStart(2, '0')}`
}
