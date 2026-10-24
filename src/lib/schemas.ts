import { z } from 'zod'

// What Claude returns from a spoken invoice. Fields only, never prose.
// Missing stays null so the confirm form asks; amounts are rupees here.
export const InvoiceExtract = z.object({
  customer_name: z.string().nullable(),
  customer_state: z.string().nullable(),
  customer_gstin: z.string().nullable(),
  customer_phone: z.string().nullable(),
  lines: z.array(
    z.object({
      description: z.string(),
      quantity: z.number(),
      rate_rupees: z.number().nullable(),
      service_number: z.number().int().nullable(),
    }),
  ),
  gst_rate: z.number().nullable(),
  due_in_days: z.number().int().nullable(),
  due_date: z.string().nullable(),
})
export type InvoiceExtract = z.infer<typeof InvoiceExtract>

export const BILL_CATEGORIES = ['travel', 'food', 'software', 'equipment', 'rent', 'other'] as const

// What Claude reads off a photo of a bill.
export const BillExtract = z.object({
  seller_name: z.string().nullable(),
  seller_gstin: z.string().nullable(),
  seller_state: z.string().nullable(),
  bill_date: z.string().nullable(),
  category: z.enum(BILL_CATEGORIES).nullable(),
  subtotal_rupees: z.number().nullable(),
  cgst_rupees: z.number().nullable(),
  sgst_rupees: z.number().nullable(),
  igst_rupees: z.number().nullable(),
  total_rupees: z.number().nullable(),
})
export type BillExtract = z.infer<typeof BillExtract>

// Claude's read also carries the bill's text, for the AgenticOrg Bill reader.
export const BillRead = BillExtract.extend({ text: z.string().nullable() })
export type BillRead = z.infer<typeof BillRead>

// What the confirm form gets: the fields, who read them, and the agent's GST check.
export type BillReading = BillExtract & { source: 'agenticorg' | 'claude'; check: string | null }

// Forms, in paise, after the person has confirmed them.
export const DetailsForm = z.object({
  name: z.string().trim().min(1, 'Your name or business name'),
  state: z.string().min(1, 'Pick your state'),
  gstin: z.string().trim().toUpperCase().optional().or(z.literal('')),
  upi_id: z
    .string()
    .trim()
    .regex(/^[\w.-]+@[\w.-]+$/, 'A UPI ID looks like name@bank'),
  services: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        kind: z.enum(['service', 'goods']),
        code: z.string().nullable(),
        code_description: z.string().nullable(),
      }),
    )
    .min(1, 'Add at least one thing you sell'),
})
export type Service = z.infer<typeof DetailsForm>['services'][number]

export const InvoiceForm = z.object({
  customer_name: z.string().trim().min(1, 'Who is this invoice for?'),
  customer_state: z.string().min(1),
  customer_phone: z.string().trim().optional(),
  customer_gstin: z.string().trim().toUpperCase().optional().or(z.literal('')),
  // Set when the owner confirmed "Same as <name>?" on the form.
  customer_id: z.string().uuid().optional(),
  issue_date: z.string().date(),
  due_date: z.string().date().optional().or(z.literal('')),
  lines: z
    .array(
      z.object({
        description: z.string().trim().min(1),
        quantity: z.number().positive(),
        rate: z.number().int().positive(),
        gst_rate: z.number().min(0).max(28),
        sac_hsn: z.string().nullable().optional(),
      }),
    )
    .min(1),
  language: z.string().optional(),
  transcript: z.string().optional(),
})
export type InvoiceForm = z.infer<typeof InvoiceForm>

export const BillForm = z.object({
  seller_name: z.string().trim().min(1, 'Who sold this?'),
  seller_gstin: z.string().trim().toUpperCase().optional().or(z.literal('')),
  seller_state: z.string().optional(),
  bill_date: z.string().date(),
  category: z.enum(BILL_CATEGORIES),
  paid_from: z.enum(['bank', 'personal']).default('bank'),
  subtotal: z.number().int().nonnegative(),
  cgst: z.number().int().nonnegative(),
  sgst: z.number().int().nonnegative(),
  igst: z.number().int().nonnegative(),
  total: z.number().int().positive(),
})
export type BillForm = z.input<typeof BillForm>
