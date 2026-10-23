# To do

Tick as you go. Each task says who owns it and what "done" means. Times are IST.
The timeline is in [PLAN.md](PLAN.md); the product is in [SPEC.md](SPEC.md).

## Tonight, Friday 2026-10-23

### Team
- [ ] **Rahul:** send Chetan `BRIEF-chetan.md`.
  Done when: he has replied with yes.
- [ ] **Chetan:** share the GST/UPI repo with Rahul and answer the questions in
  `BRIEF-chetan.md` §1.
  Done when: we know the stack, whether GST splits CGST/SGST vs IGST, and whether UPI
  confirms payment or is link and QR only.
- [ ] **Chetan:** list 40 people who'd send an invoice, and message each one.
  Done when: the sheet has 40 names, and at least 25 have said yes.
- [ ] **Chetan:** set up the user sheet: name, said yes, link sent, used it, amount, quote.

### Checks before building
- [ ] **Chetan:** record 3 invoices spoken in Kannada on your phone, each with a rupee
  amount and a company name. Send them to Rahul.
- [ ] **Rahul:** make an ElevenLabs API key and run Scribe on 3 recordings each in Hindi,
  Kannada and Malayalam, each with a rupee amount and a company name.
  Done when: amounts and names come through right in at least 2 of 3 per language.
  Cut any language that fails (SPEC.md cut list).
- [ ] **Rahul:** paste those transcripts into Claude with the invoice fields from SPEC.md.
  Done when: customer, amount, GST rate and due date come out right, and a missing field
  comes back empty, not guessed.

### Accounts and setup
- [ ] **Rahul:** Anthropic API key with credit loaded.
- [ ] **Rahul:** pick hosting, Vercel or Render. Write the choice in NEEDS.md.
- [ ] **Rahul:** create the Postgres database. URL in `.env`.
- [ ] **Rahul:** GitHub repo for this folder, private, Chetan added. Push.
- [ ] **Rahul:** try the Pine Labs test-key signup.
  Done when: we have keys, or we know they need a mentor. Either is fine.
- [ ] **Rahul:** skeleton app (Next.js, TypeScript, Tailwind, shadcn) deployed to the real URL.
  Done when: the URL loads on a phone and a page reads one row from the database.

### Design
- [ ] **Rahul:** design the public invoice screen (SPEC.md screen 5).
  Done when: one finished invoice, GST lines and UPI QR included, that you'd send a client.
- [ ] **Rahul:** brand direction, a few lines and references, so Chetan can work to it
  tomorrow.

### Kit
- [ ] Laptops and chargers, power strip, headset mic, phones charged, hotspot ready.

## Saturday 2026-10-24

### 09:00 to 11:00: set up
- [ ] **Rahul:** ask the organisers the four questions in NEEDS.md. Write the answers
  in NEEDS.md.
- [ ] **Chetan:** find the Pine Labs mentor; get test keys if we don't have them.
- [ ] **Chetan:** 5 name options by 10:30. **Rahul** picks by 11:00.
- [ ] **Rahul:** lock scope against SPEC.md. Cut anything that failed last night's checks.
- [ ] **Chetan:** confirm the yeses still stand. Tell them: link at 16:00.

### 11:00 to 13:00: the core
- [ ] **Rahul:** first visit makes a workspace (cookie), "Your details" form saves.
- [ ] **Rahul:** mic button → `/api/transcribe` → `/api/extract` → confirm form.
- [ ] **Rahul:** confirm saves the invoice and posts its ledger entry in one transaction.
  Done when: debits equal credits, and an unbalanced entry is refused.
- [ ] **Rahul:** deploy.
- [ ] **Chetan:** GTM plan draft, 1 page.
- [ ] **Checkpoint 13:00:** a spoken invoice saves with a balanced ledger entry, on the
  live URL. If not, cut from SPEC.md's list now.

### 13:00 to 16:00: the rest of the product
- [ ] **Rahul:** public invoice page with UPI QR and Pay button.
- [ ] **Rahul:** reminder message with "Send on WhatsApp" and "Copy".
- [ ] **Rahul:** Who owes me, read from the `receivable` balance.
- [ ] **Rahul:** Mark as paid, posting the payment entry.
- [ ] **Rahul:** `/stats`: users today, invoices today, ₹ invoiced today.
- [ ] **Rahul:** GST this month (first to cut).
- [ ] **Rahul:** Pine Labs payment link (cut if no keys).
- [ ] **Rahul:** landing page.
- [ ] **Chetan:** deck content: problem, demo, traction, the books as the company, the ask.
- [ ] **Chetan:** test the live link on 3 phones at 15:00. Report bugs to Rahul.
- [ ] **Checkpoint 15:30:** the public link works on a phone. If not, nothing else gets
  built until it does.

### 16:00 to 19:30: users and the pitch
- [ ] **Chetan:** 16:00, send the link to every yes, one personal message each.
- [ ] **Chetan:** chase, work the room, collect "would you use this" quotes.
  Count from `/stats` to Rahul every 30 minutes.
- [ ] **Rahul:** fix what users break.
- [ ] **Rahul:** brand kit: name, logo, colours, type, on one page.
- [ ] **Rahul:** design the deck from Chetan's content. Add the `/stats` numbers and quotes.
- [ ] **Chetan:** 18:30, record the demo video, under 90 seconds, with a Kannada invoice.
  Upload by 19:30.
- [ ] **Chetan:** fill in the submission form with all six deliverables.
- [ ] **19:30: 20 users.** Screenshot `/stats`.

### 19:30 to 21:00: demo
- [ ] **Rahul:** pitch. Open with the live demo, close on "₹X invoiced today".
