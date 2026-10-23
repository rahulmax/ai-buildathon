# Spec

Two ways in, one set of books.

- **Money in:** say an invoice, get a GST invoice, a UPI QR and a reminder.
- **Money out:** snap a bill, and it's logged as an expense with the GST you paid.

The books show what both add up to. Anything past that is on [ROADMAP.md](ROADMAP.md),
not in today's build.

## The flow

1. **Open the link.** No sign-up. The first visit makes a workspace and keeps it in a
   cookie. A login wall at 16:00 costs us users. Add "save with email" later if there is time.
2. **Your details, once.** Name or business name, state, GSTIN (optional), UPI ID.
   These go on every invoice.
3. **Talk.** Hold the mic button and say the invoice in English, Hindi, Kannada or Malayalam.
4. **Check.** The invoice appears as a filled form: customer, lines, GST rate, due date.
   Every field is editable. Amounts are the field most likely to be misheard, so show them
   large. Nothing is saved until the user confirms.
5. **Done.** The invoice gets its own public link with a UPI QR and a Pay button. Below it,
   a reminder message with "Send on WhatsApp" (a `wa.me` link, no API needed) and "Copy".
6. **Snap a bill.** The camera button takes a photo of a bill or receipt. It appears as a
   filled form: seller, seller's GSTIN, date, amount, GST, category. Same rule: editable,
   nothing saved until confirmed.
7. **Books.** Two views:
   - **Who owes me:** open invoices, oldest first, total at the top. "Mark as paid" on an
     invoice posts the payment.
   - **GST this month:** GST collected on invoices, minus GST paid on bills, equals GST to
     pay. Split CGST, SGST and IGST. Without bills this view is only half a number.

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

## Photo to bill

```
camera (<input type="file" accept="image/*" capture="environment">)
  → POST /api/read-bill    Claude reads the image, structured output → bill JSON
  → confirm form
  → POST /api/bills        save bill + post ledger entry, in one transaction
```

Same rules as voice: fields only, missing stays empty. The photo is not stored in v1.
We keep the fields, which also means we hold no images of people's receipts.

## Data contract

Money is integer paise everywhere. Never floats.

**workspace**: id, name, state, gstin?, upi_id, created_at

**customer**: id, workspace_id, name, state?, gstin?, phone?

**invoice**: id, workspace_id, customer_id, number, issue_date, due_date, place_of_supply,
subtotal, cgst, sgst, igst, total, status (`open`, `paid`), public_slug, language, transcript

**invoice_line**: id, invoice_id, description, sac_hsn?, quantity, rate, amount, gst_rate

**payment**: id, invoice_id, amount, method (`upi`, `pine_labs`, `manual`), paid_at

**bill**: id, workspace_id, seller_name, seller_gstin?, bill_date, category, subtotal, cgst,
sgst, igst, total, created_at

**ledger_entry**: id, workspace_id, date, memo, source_type, source_id

**ledger_line**: id, entry_id, account, debit, credit

Accounts are a fixed list, no chart-of-accounts screen:
`receivable`, `revenue`, `bank`, `expenses`,
`cgst_payable`, `sgst_payable`, `igst_payable`,
`cgst_input`, `sgst_input`, `igst_input`.

Bill categories are a fixed list too: travel, food, software, equipment, rent, other.

### Rules

- Every ledger entry balances: total debits equal total credits. Check it in code before
  insert, and as a Postgres constraint trigger if there is time.
- **An invoice posts:** debit `receivable` total; credit `revenue` subtotal; credit the
  `*_payable` GST accounts their amounts.
- **A payment posts:** debit `bank`; credit `receivable`.
- **A bill posts**, treated as already paid: debit `expenses` subtotal; debit the
  `*_input` GST accounts their amounts; credit `bank` total.
- **No seller GSTIN, no input credit.** GST on a bill without the seller's GSTIN can't be
  claimed, so the whole total goes to `expenses` and the input accounts get nothing. Say so
  on the confirm form: "No GSTIN on this bill, so its GST can't be claimed."
- **GST to pay** = `*_payable` balances minus `*_input` balances for the month. If it's
  negative, show it as credit carried forward, not as a refund.
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
3. Home: mic button, camera button, recent activity, the two book totals
4. Invoice confirm form
5. Invoice, public (what the customer sees and pays from)
6. Bill confirm form
7. Who owes me
8. GST this month
9. `/stats`: users today, invoices today, bills today, ₹ invoiced today. This is the
   traction slide.

## Stack

Next.js, TypeScript, Tailwind, shadcn. Postgres. zod for both extract outputs and every
form. Server components by default.

Invoice design is where we beat Chat2Cash. Design it before the build, not at 15:00.

## Cut order

Cut from the top when behind:

1. Snap a bill. Built 15:00 to 16:00 only if the 13:00 checkpoint passed. If cut, the
   pitch falls back to invoices plus books, and bills move to the roadmap's first month.
2. Pine Labs (UPI stays)
3. Malayalam, then Hindi (keep English and Kannada: Kannada is the local demo)
4. GST this month view (the ledger still records it)
5. Editing an invoice after it's saved

Never cut: voice, the confirm step, the public invoice with UPI, the ledger posting,
`/stats`.
