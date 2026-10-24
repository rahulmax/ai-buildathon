import type { TransactionSql } from 'postgres'

export type Account =
  | 'receivable' | 'revenue' | 'bank' | 'expenses'
  | 'cgst_payable' | 'sgst_payable' | 'igst_payable'
  | 'cgst_input' | 'sgst_input' | 'igst_input'

export type Line = {
  account: Account
  debit?: number
  credit?: number
  customerId?: string | null
}

type Entry = {
  workspaceId: string
  date: string
  memo: string
  sourceType: 'invoice' | 'payment' | 'bill'
  sourceId: string
  lines: Line[]
}

export class UnbalancedEntry extends Error {}

// Drop zero lines, then refuse anything that doesn't balance.
export function checkBalanced(lines: Line[]) {
  const kept = lines.filter((l) => (l.debit ?? 0) > 0 || (l.credit ?? 0) > 0)
  const debits = kept.reduce((s, l) => s + (l.debit ?? 0), 0)
  const credits = kept.reduce((s, l) => s + (l.credit ?? 0), 0)
  if (debits !== credits || debits === 0) {
    throw new UnbalancedEntry(`Debits ${debits} do not equal credits ${credits}`)
  }
  return kept
}

export async function postEntry(tx: TransactionSql, entry: Entry) {
  const lines = checkBalanced(entry.lines)
  const [row] = await tx`
    insert into ledger_entry (workspace_id, date, memo, source_type, source_id)
    values (${entry.workspaceId}, ${entry.date}, ${entry.memo}, ${entry.sourceType}, ${entry.sourceId})
    returning id`
  for (const l of lines) {
    await tx`
      insert into ledger_line (entry_id, account, debit, credit, customer_id)
      values (${row.id}, ${l.account}, ${l.debit ?? 0}, ${l.credit ?? 0}, ${l.customerId ?? null})`
  }
  return row.id as string
}
