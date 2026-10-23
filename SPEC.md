# Spec

## The flow

1. **Open the link.** No sign-up. The first visit makes a workspace and keeps it in a
   cookie. A login wall at 16:00 costs us users. Add "save with email" later if there is time.
2. **Your details, once.** Name or business name, state, GSTIN (optional), UPI ID.
   These go on every invoice.
3. **Talk.** Hold the mic button and say the invoice in English, Hindi or Malayalam.
4. **Check.** The invoice appears as a filled form: customer, lines, GST rate, due date.
   Every field is editable. Amounts are the field most likely to be misheard, so show them
   large. Nothing is saved until the user confirms.
5. **Done.** The invoice gets its own public link with a UPI QR and a Pay button. Below it,
   a reminder message with "Send on WhatsApp" (a `wa.me` link, no API needed) and "Copy".
6. **Books.** Two views: **Who owes me** (open invoices, oldest first, total at the top)
   and **GST this month** (tax collected, split CGST, SGST and IGST). "Mark as paid" on
   an invoice posts the payment.

## Voice to invoice

```
browser mic (MediaRecorder)
  → POST /api/transcribe   ElevenLabs Scribe → text + detected language
  → POST /api/extract      Claude, structured output → invoice JSON
  → confirm form
  → POST /api/invoices     save invoice + post ledger entry, in one transaction
```

The extract step returns fields, never prose. If a field is missing (no due date, no GST
rate), leave it empty and let the form ask. Do not guess a GST rate.

## Data contract

Money is integer paise everywhere. Never floats.

**workspace**: id, name, state, gstin?, upi_id, created_at

**customer**: id, workspace_id, name, state?, gstin?, phone?

**invoice**: id, workspace_id, customer_id, number, issue_date, due_date, place_of_supply,
subtotal, cgst, sgst, igst, total, status (`open`, `paid`), public_slug, language, transcript

**invoice_line**: id, invoice_id, description, sac_hsn?, quantity, rate, amount, gst_rate

**payment**: id, invoice_id, amount, method (`upi`, `pine_labs`, `manual`), paid_at

**ledger_entry**: id, workspace_id, date, memo, source_type, source_id

**ledger_line**: id, entry_id, account, debit, credit

Accounts are a fixed list, no chart-of-accounts screen:
`receivable`, `revenue`, `cgst_payable`, `sgst_payable`, `igst_payable`, `bank`.

### Rules

- Every ledger entry balances: total debits equal total credits. Check it in code before
  insert, and as a Postgres constraint trigger if there is time.
- **An invoice posts:** debit `receivable` total; credit `revenue` subtotal; credit the
  GST accounts their amounts.
- **A payment posts:** debit `bank`; credit `receivable`.
- **GST split:** supplier state equals place of supply → CGST and SGST, half each.
  Different states → IGST. Customer state unknown → assume same state and show it on the
  confirm form. Chetan's code may already do this; use his if it does.
- **Invoice numbers** run in sequence per workspace per financial year, e.g. `INV-2627-0001`.
  GST allows up to 16 characters.
- "Who owes me" is the `receivable` balance per customer, read from the ledger, not from
  invoice status. That's what makes it books and not a list.

## Screens

1. Landing page (separate deliverable, can share the app's styles)
2. Your details (first visit only)
3. Home: mic button, recent invoices, the two book totals
4. Confirm form
5. Invoice, public (what the customer sees and pays from)
6. Who owes me
7. GST this month
8. `/stats`: users today, invoices today, ₹ invoiced today. This is the traction slide.

## Stack

Next.js, TypeScript, Tailwind, shadcn. Postgres. zod for the extract output and every
form. Server components by default.

Invoice design is where we beat Chat2Cash. Design it before the build, not at 15:00.

## Cut order

Cut from the top when behind:

1. Purchase bills by photo (was never in v1)
2. Pine Labs (UPI stays)
3. Malayalam (keep English and Hindi)
4. GST this month view (the ledger still records it)
5. Editing an invoice after it's saved

Never cut: voice, the confirm step, the public invoice with UPI, the ledger posting,
`/stats`.
