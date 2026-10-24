// GSTIN: 2-digit state code, 10-character PAN, entity number, 'Z', check character.
// We check the shape, the check character and the state. We can't tell from
// the number alone whether it's active; that needs a GSTN lookup.

const STATE_CODES: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '25': 'Dadra and Nagar Haveli and Daman and Diu', '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala',
  '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar Islands', '36': 'Telangana',
  '37': 'Andhra Pradesh', '38': 'Ladakh',
}

const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

export function gstinCheckChar(first14: string) {
  let sum = 0
  for (let i = 0; i < 14; i++) {
    const product = CHARS.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2)
    sum += Math.floor(product / 36) + (product % 36)
  }
  return CHARS[(36 - (sum % 36)) % 36]
}

export type GstinCheck = { ok: true; gstin: string; state: string } | { ok: false; error: string }

export function checkGstin(input: string, expectedState?: string): GstinCheck {
  const gstin = input.replace(/\s/g, '').toUpperCase()
  if (gstin.length !== 15) return { ok: false, error: `A GSTIN has 15 characters. This one has ${gstin.length}.` }
  if (!SHAPE.test(gstin)) return { ok: false, error: 'That isn’t a valid GSTIN. Check it against your GST certificate.' }
  const state = STATE_CODES[gstin.slice(0, 2)]
  if (!state) return { ok: false, error: `${gstin.slice(0, 2)} isn’t a state code. A GSTIN starts with your state’s code.` }
  if (gstinCheckChar(gstin.slice(0, 14)) !== gstin[14]) {
    return { ok: false, error: 'That GSTIN has a typo: its last character doesn’t match. Check it against your GST certificate.' }
  }
  if (expectedState && state !== expectedState) {
    return { ok: false, error: `This GSTIN is registered in ${state}, but you picked ${expectedState}.` }
  }
  return { ok: true, gstin, state }
}

export const isGstin = (s: string) => checkGstin(s).ok
