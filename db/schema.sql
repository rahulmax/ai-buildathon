-- Money is integer paise everywhere.

create table if not exists workspace (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  state text not null,
  gstin text,
  upi_id text not null,
  created_at timestamptz not null default now()
);

-- What the business sells, with its official SAC (services) or HSN (goods) code.
create table if not exists workspace_service (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  name text not null,
  kind text not null check (kind in ('service', 'goods')),
  code text,
  code_description text,
  created_at timestamptz not null default now()
);

create table if not exists customer (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  name text not null,
  state text,
  gstin text,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists invoice (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  customer_id uuid not null references customer(id),
  number text not null,
  issue_date date not null,
  due_date date,
  place_of_supply text not null,
  subtotal bigint not null,
  cgst bigint not null default 0,
  sgst bigint not null default 0,
  igst bigint not null default 0,
  total bigint not null,
  status text not null default 'open' check (status in ('open', 'paid')),
  public_slug text not null unique,
  language text,
  transcript text,
  created_at timestamptz not null default now(),
  unique (workspace_id, number)
);

create table if not exists invoice_line (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoice(id),
  description text not null,
  sac_hsn text,
  quantity numeric not null default 1,
  rate bigint not null,
  amount bigint not null,
  gst_rate numeric not null
);

create table if not exists payment (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoice(id),
  amount bigint not null,
  method text not null check (method in ('upi', 'pine_labs', 'manual')),
  paid_at timestamptz not null default now()
);

create table if not exists bill (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  seller_name text not null,
  seller_gstin text,
  bill_date date not null,
  category text not null check (category in ('travel', 'food', 'software', 'equipment', 'rent', 'other')),
  subtotal bigint not null,
  cgst bigint not null default 0,
  sgst bigint not null default 0,
  igst bigint not null default 0,
  total bigint not null,
  created_at timestamptz not null default now()
);

create table if not exists ledger_entry (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  date date not null,
  memo text not null,
  source_type text not null,
  source_id uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists ledger_line (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references ledger_entry(id),
  account text not null check (account in (
    'receivable', 'revenue', 'bank', 'expenses',
    'cgst_payable', 'sgst_payable', 'igst_payable',
    'cgst_input', 'sgst_input', 'igst_input'
  )),
  debit bigint not null default 0 check (debit >= 0),
  credit bigint not null default 0 check (credit >= 0),
  customer_id uuid references customer(id)
);

create table if not exists chase (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoice(id),
  source text not null,
  message text not null,
  payment_link text,
  agent_run_id text,
  trace jsonb,
  created_at timestamptz not null default now()
);

-- Every entry balances: checked in code before insert, and here at commit.
create or replace function ledger_entry_balanced() returns trigger as $$
declare d bigint; c bigint;
begin
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0) into d, c
    from ledger_line where entry_id = new.entry_id;
  if d <> c then
    raise exception 'ledger entry % does not balance: debits % credits %', new.entry_id, d, c;
  end if;
  return null;
end $$ language plpgsql;

drop trigger if exists ledger_line_balanced on ledger_line;
create constraint trigger ledger_line_balanced
  after insert or update on ledger_line
  deferrable initially deferred
  for each row execute function ledger_entry_balanced();

-- 2026-10-24: decisions from the intent model (intent/*.json). Idempotent, runs every cold start.

-- Team test workspaces stay out of /stats. Email for "Save with email" magic links.
alter table workspace add column if not exists is_team boolean not null default false;
alter table workspace add column if not exists email text;
create unique index if not exists workspace_email_key on workspace (lower(email)) where email is not null;

create table if not exists magic_link (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Cancel an invoice (a reversal entry posts against it). Pine Labs payment link per invoice.
alter table invoice drop constraint if exists invoice_status_check;
alter table invoice add constraint invoice_status_check check (status in ('open', 'paid', 'cancelled'));
alter table invoice add column if not exists cancelled_at timestamptz;
alter table invoice add column if not exists pay_link text;
alter table invoice add column if not exists pay_order_id text;

-- Paid less TDS; gateway reference for webhook payments.
alter table payment add column if not exists tds bigint not null default 0;
alter table payment add column if not exists gateway_ref text;
create unique index if not exists payment_gateway_ref_key on payment (gateway_ref) where gateway_ref is not null;

-- Gateway payout: money moves from pine_labs_clearing to bank, less the fee.
create table if not exists settlement (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  payment_id uuid not null references payment(id) unique,
  payout bigint not null,
  fee bigint not null default 0,
  settled_at timestamptz not null default now()
);

-- Bills paid from the bank, or personally (owner_contribution).
alter table bill add column if not exists paid_from text not null default 'bank';
alter table bill drop constraint if exists bill_paid_from_check;
alter table bill add constraint bill_paid_from_check check (paid_from in ('bank', 'personal'));

alter table ledger_line drop constraint if exists ledger_line_account_check;
alter table ledger_line add constraint ledger_line_account_check check (account in (
  'receivable', 'revenue', 'bank', 'expenses',
  'cgst_payable', 'sgst_payable', 'igst_payable',
  'cgst_input', 'sgst_input', 'igst_input',
  'pine_labs_clearing', 'tds_receivable', 'owner_contribution'
));

-- access: a "Save with email" link carries the email to attach once the link is clicked.
-- Sign-in links leave it null.
alter table magic_link add column if not exists email text;
