import QRCode from 'qrcode'
import { rupeesString } from './money'

export function upiLink(o: { upiId: string; payee: string; amount: number; note: string }) {
  const p = new URLSearchParams({
    pa: o.upiId,
    pn: o.payee,
    am: rupeesString(o.amount),
    cu: 'INR',
    tn: o.note,
  })
  return `upi://pay?${p.toString().replace(/\+/g, '%20')}`
}

export const qrSvg = (text: string) =>
  QRCode.toString(text, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })
