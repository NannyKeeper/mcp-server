/**
 * record_tax_payment: record that the household paid a
 * quarter's tax to the IRS or a state agency, through
 * POST /api/v1/taxes/payments, which drives the Taxes page's own "I've paid
 * this" and "Record payment".
 *
 * ⛔ Passed through unchanged, like get_quarter_taxes: a refusal carries the
 * reason and the quarter as it stands, and a tool that summarised it could
 * hide that nothing was recorded.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CLIENT_HEADER, getToolContext, type ToolContext } from "../context.ts";
import { publicDescriptions, toolResult } from "../public-profile.ts";

export interface RecordTaxPaymentArgs {
  year: number;
  quarter: number;
  destination: string;
  expected_amount?: number;
  amount?: number;
  payment_date?: string;
  payment_method?: string;
  confirmation_number?: string;
  notes?: string;
  closes_filing?: boolean;
  idempotency_key: string;
  employer_id?: string;
}

export async function executeRecordTaxPayment(
  args: RecordTaxPaymentArgs,
  context?: ToolContext,
): Promise<string> {
  const { apiKey, apiBase } = getToolContext(context);
  if (!apiKey) {
    return JSON.stringify({
      error: "NANNYKEEPER_API_KEY environment variable is not set. Get a key at nannykeeper.com/developers/keys",
    });
  }
  const { idempotency_key: idempotencyKey, ...body } = args;
  try {
    const response = await fetch(`${apiBase}/api/v1/taxes/payments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        ...CLIENT_HEADER,
      },
      // Undefined members drop out of the JSON, so the API sees exactly the
      // one figure the agent chose.
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) {
      return JSON.stringify({
        error: data.error?.message || `API error: ${response.status}`,
        // The stable name of the refusal (figures_changed, figure_unavailable,
        // nothing_due, annual_filing_needs_amount, destination_not_found),
        // which the tool description tells an agent to act on.
        code: data.error?.code,
        details: data.error?.details,
      });
    }
    return JSON.stringify(data);
  } catch (error) {
    return JSON.stringify({
      error: `Network error: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
}

/**
 * Registered from here rather than inline in server.ts, so parallel tool
 * additions do not collide there. `employerId` is server.ts's shared
 * EMPLOYER_ID_OPTIONAL, passed in so its wording stays in one place.
 */
export function registerRecordTaxPayment(
  server: McpServer,
  context: ToolContext | undefined,
  employerId: z.ZodOptional<z.ZodString>,
): void {
  server.tool(
    "record_tax_payment",
    context?.publicConnection ? publicDescriptions.record_tax_payment : (
    "Record that the household PAID a quarter's tax to the IRS or a state agency, as the Taxes page's \"I've paid " +
      "this\" does; once the payment covers what is owed, NannyKeeper stops reminding them about it. NannyKeeper " +
      "never sends the payment: only call this " +
      "after the user tells you they paid. First call get_quarter_taxes for the same year and quarter. `destination` is " +
      "\"federal\" or a state_destinations id from that answer. Send exactly one figure: `expected_amount` when they paid " +
      "the amount get_quarter_taxes showed (federal.due_now, or that destination's amount_owed), or `amount` with what " +
      "they actually paid. A state `amount` below what is owed counts as an installment and the reminders continue; " +
      "if the agency billed exactly that amount and the user says it settles the filing, also send closes_filing true. " +
      "If the answer is figures_changed, the figure moved since you read it: show the user the " +
      "new figure and ask before trying again. figure_unavailable, nothing_due or annual_filing_needs_amount mean " +
      "NannyKeeper will not confirm a figure here: ask the user what they paid and send it as `amount`. " +
      "already_recorded_different means a different payment is already on file and nothing was recorded: tell the " +
      "user and ask. already_settled means the user already marked that filing paid; changes are made on the Taxes " +
      "page. Pass the " +
      "user's own date as payment_date when you know it; it defaults to today in US Eastern time. Use one new " +
      "idempotency_key per payment and reuse it only to retry that same payment. already_recorded true means " +
      "nothing new was written. This tool only ADDS a payment: it cannot change or remove one already recorded " +
      "(its method, confirmation number, date or amount), and calling it again with amount records a second " +
      "payment. For a correction, send the user to the Taxes page in NannyKeeper. " +
      "For a household other than the key's own, pass its employer_id."
    ),
    {
      year: z.number().int().min(2020).max(2100).describe("The tax year, for example 2026."),
      quarter: z.number().int().min(1).max(4).describe("The calendar quarter, 1 to 4."),
      destination: z
        .string()
        .max(64)
        .describe("\"federal\", or a state_destinations id from get_quarter_taxes, for example MD-UI."),
      expected_amount: z
        .number()
        .min(0.01)
        .max(1_000_000)
        .optional()
        .describe("Paid as shown: the dollar figure get_quarter_taxes returned for this destination. Send this or amount, never both."),
      amount: z
        .number()
        .min(0.01)
        .max(1_000_000)
        .optional()
        .describe("What the household actually paid, in dollars to the cent. Send this or expected_amount, never both."),
      payment_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("Optional. The day they paid, YYYY-MM-DD. Defaults to today in US Eastern time."),
      payment_method: z
        .enum(["eftps", "check", "direct_pay", "state_portal", "carrier_portal", "other"])
        .optional()
        .describe("Optional. How they paid: eftps or direct_pay for the IRS, state_portal or carrier_portal for a state."),
      confirmation_number: z.string().max(100).optional().describe("Optional. The confirmation number the IRS or agency gave them."),
      notes: z.string().max(500).optional().describe("Optional. A note to keep with the payment."),
      closes_filing: z
        .boolean()
        .optional()
        .describe("Optional, with amount on a state agency only: the user's figure closes that filing, as \"I paid a different amount\" on the Taxes page does."),
      idempotency_key: z
        .string()
        .min(8)
        .max(255)
        .describe("A new unique string (a UUID) for this payment. Reuse it only to retry the same payment after an error."),
      employer_id: employerId,
    },
    {
      title: "Record Tax Payment",
      readOnlyHint: false,
      // It moves no money, but it turns off a household's tax reminders, so
      // clients should confirm it with the user like any other consequential
      // write.
      destructiveHint: true,
      // Repeating it with the same idempotency_key returns the first answer.
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args) => toolResult(await executeRecordTaxPayment(args, context), context?.publicConnection)
  );
}
