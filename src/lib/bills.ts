import type { TransactionSql } from 'postgres'
import { checkGstin, isGstin } from './gstin'

// Bill rules shared by the confirm form and createBill. Pure, except the
// duplicate lookup, which runs inside the caller's transaction.

// Input credit needs a valid seller GSTIN, and food never gets it (OQ-BIL-1).
export const claimsGst = (category: string, gstin: string | null | undefined) =>
  category !== 'food' && !!gstin && isGstin(gstin)

// The total wins; the bill's own subtotal only drives a warning (OQ-BIL-2).
// Within ₹1 counts as adding up, for round-off.
export function addsUp(printedSubtotal: number | null, total: number, gst: number) {
  if (printedSubtotal == null) return true
  return Math.abs(total - gst - printedSubtotal) <= 100
}

// Same state as the owner means CGST and SGST; another state means IGST.
// Returns a note when the printed split disagrees, else null (OQ-BIL-4).
export function gstSplitNote(gstin: string, ownerState: string, cgst: number, sgst: number, igst: number) {
  const check = checkGstin(gstin)
  if (!check.ok || cgst + sgst + igst === 0) return null
  if (check.state === ownerState) {
    return igst > 0 ? `Seller is in ${check.state}, like you, so this should be CGST and SGST. Check the bill.` : null
  }
  return cgst + sgst > 0 ? `Seller is in ${check.state}, so this should be IGST. Check the bill.` : null
}

// A likely repeat: same seller, date and total as a bill already logged (OQ-BIL-5).
export async function findDuplicateBill(
  tx: TransactionSql,
  bill: { workspaceId: string; sellerName: string; billDate: string; total: number },
) {
  const [row] = await tx`
    select id from bill
    where workspace_id = ${bill.workspaceId}
      and lower(trim(seller_name)) = lower(trim(${bill.sellerName}))
      and bill_date = ${bill.billDate}
      and total = ${bill.total}
    limit 1`
  return row ? (row.id as string) : null
}
