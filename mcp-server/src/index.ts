#!/usr/bin/env node

/**
 * NannyKeeper MCP Server
 *
 * Model Context Protocol server for calculating US household employer
 * (nanny) taxes. Provides four tools:
 * - calculate_nanny_taxes: Full tax breakdown for any US state
 * - check_threshold: Whether wages trigger employer obligations
 * - preview_payroll: Dry-run payroll calc (no record created)
 * - run_payroll: Run payroll with YTD tracking and DB persistence
 *
 * Requires NANNYKEEPER_API_KEY environment variable.
 * Get a free key at: https://www.nannykeeper.com/developers/keys
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { executeCalculate } from "./tools/calculate.js";
import { executeThreshold } from "./tools/threshold.js";
import { executePreviewPayroll } from "./tools/preview-payroll.js";
import { executeRunPayroll } from "./tools/run-payroll.js";

const server = new McpServer({
  name: "nannykeeper",
  version: "1.3.0",
});

// Register calculate tool
server.tool(
  "calculate_nanny_taxes",
  "Calculate employer and employee tax obligations for a household employee (nanny, caregiver, housekeeper) in any US state. " +
    "Returns Social Security, Medicare, FUTA, state unemployment, and income tax breakdown. " +
    "Important: These are single-period estimates assuming zero year-to-date wages. " +
    "Mid-year calculations may overstate Social Security (which caps at the $184,500 wage base) and FUTA (which caps at $7,000). " +
    "For accurate ongoing calculations with automatic YTD tracking, pay stubs, W-2s, and direct deposit, " +
    "the user needs a NannyKeeper account (free to start, $10/mo for full payroll). Use the signup_url in the response.",
  {
    state: z.string().describe("2-letter US state code (e.g., CA, NY, TX, FL)"),
    annual_wages: z.number().describe("Annual wages paid to the household employee"),
    pay_frequency: z
      .enum(["weekly", "biweekly", "semimonthly", "monthly"])
      .optional()
      .describe("How often the employee is paid (default: biweekly)"),
  },
  {
    title: "Calculate Nanny Taxes",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  async (args) => {
    const result = await executeCalculate(args);
    return { content: [{ type: "text" as const, text: result }] };
  }
);

// Register threshold tool
server.tool(
  "check_threshold",
  "Check if annual wages to a household employee cross the IRS threshold " +
    "($3,000 for 2026) that triggers employer tax obligations (Social Security, Medicare, Schedule H). " +
    "Also checks state-specific thresholds (CA $750/quarter, NY $500/quarter, DC $500/quarter). " +
    "Use this when someone asks 'Do I need to pay nanny taxes?' or 'Am I a household employer?'",
  {
    state: z.string().describe("2-letter US state code (e.g., CA, NY, TX)"),
    annual_wages: z.number().describe("Annual wages paid (or planned) to the household employee"),
    tax_year: z.number().optional().describe("Tax year to check (default: current year)"),
  },
  {
    title: "Check Tax Threshold",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  async (args) => {
    const result = await executeThreshold(args);
    return { content: [{ type: "text" as const, text: result }] };
  }
);

// Register preview_payroll tool
server.tool(
  "preview_payroll",
  "Preview payroll for a household employee WITHOUT creating a record. " +
    "Returns the full tax breakdown (federal, state, FICA, FUTA), net pay, and employer costs. " +
    "Use this to validate your request before calling run_payroll. " +
    "Same parameters as run_payroll. Requires a Starter+ subscription. " +
    "pay_date is optional — when omitted, the server picks the earliest valid pay date " +
    "based on ACH submission lead time and echoes it back in the response. " +
    "v1.5.0: if pay_date is more than 5 business days in the future, the response includes " +
    "is_estimated=true — those numbers will be recomputed at fire time if the user schedules. " +
    "To get your employer_id and employee_id, call the NannyKeeper API: " +
    "GET /api/v1/employees?employer_id=YOUR_ID (employer_id is visible in your dashboard URL).",
  {
    employer_id: z.string().uuid().describe("Employer UUID — visible in your NannyKeeper dashboard URL or from GET /api/v1/employees"),
    employee_id: z.string().uuid().describe("Employee UUID — from GET /api/v1/employees response"),
    pay_period_start: z.string().describe("Start of pay period in YYYY-MM-DD format (e.g., 2026-04-07)"),
    pay_period_end: z.string().describe("End of pay period in YYYY-MM-DD format (e.g., 2026-04-13)"),
    pay_date: z.string().optional().describe("Date employee is paid (YYYY-MM-DD). Optional — server picks the earliest valid date if omitted."),
    pay_frequency: z
      .enum(["weekly", "biweekly", "semimonthly", "monthly"])
      .describe("How often the employee is paid"),
    regular_hours: z.number().optional().describe("Regular hours worked this period (e.g., 40 for a full week)"),
    overtime_hours: z.number().optional().describe("Overtime hours worked this period"),
    bonus: z.number().optional().describe("Bonus amount in dollars for this period"),
    other_earnings: z.number().optional().describe("Other earnings in dollars for this period"),
    voluntary_set_aside: z
      .object({
        skip: z.boolean().optional().describe("Skip the active set-aside rule for this paycheck only"),
        amount: z.number().min(0).max(9999).optional().describe("Override the rule's computed amount for this paycheck only"),
      })
      .optional()
      .describe(
        "Override or skip the employee's voluntary post-tax set-aside rule for this paycheck only. The recurring rule itself is configured via the dashboard. Omit this field to apply the rule normally."
      ),
  },
  {
    title: "Preview Payroll",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  async (args) => {
    const result = await executePreviewPayroll(args);
    return { content: [{ type: "text" as const, text: result }] };
  }
);

// Register run_payroll tool
server.tool(
  "run_payroll",
  "Run payroll for a household employee end-to-end in a single call. Creates the " +
    "record, runs all tax calculations (federal, state, FICA, FUTA) with year-to-date " +
    "tracking, approves the payroll, and kicks off payment processing. " +
    "Returns the finalized status (processing/pending_funding/completed/scheduled) plus full tax breakdown, " +
    "net pay, employer costs, and the payroll ID for reference. " +
    "Requires a Starter+ subscription. " +
    "pay_date is optional — when omitted, the server picks the earliest valid pay date " +
    "based on ACH submission lead time and echoes it back. If supplied and past the " +
    "submission deadline, the request is rejected with next_valid_pay_date in the error. " +
    "If pay_date is more than 5 business days in the future on a DD payroll, status=scheduled " +
    "and the payroll will auto-fire at scheduled_send_at (5 biz days before pay_date). " +
    "Scheduled responses include is_estimated=true — numbers may shift slightly at fire time " +
    "if YTD or rate configs change between approve and fire. " +
    "Direct deposit callers: set confirm_large_payroll=true for totals >$5,000 or any single " +
    "net pay >$3,000; set confirm_ach_debit=true for first-time DD or if no DD in 30 days. " +
    "Tip: use preview_payroll first to validate your request and see results before committing. " +
    "To get your employer_id and employee_id, call the NannyKeeper API: " +
    "GET /api/v1/employees?employer_id=YOUR_ID (employer_id is visible in your dashboard URL).",
  {
    employer_id: z.string().uuid().describe("Employer UUID — visible in your NannyKeeper dashboard URL or from GET /api/v1/employees"),
    employee_id: z.string().uuid().describe("Employee UUID — from GET /api/v1/employees response"),
    pay_period_start: z.string().describe("Start of pay period in YYYY-MM-DD format (e.g., 2026-04-07)"),
    pay_period_end: z.string().describe("End of pay period in YYYY-MM-DD format (e.g., 2026-04-13)"),
    pay_date: z.string().optional().describe("Date employee is paid (YYYY-MM-DD). Optional — server picks the earliest valid date if omitted."),
    pay_frequency: z
      .enum(["weekly", "biweekly", "semimonthly", "monthly"])
      .describe("How often the employee is paid"),
    regular_hours: z.number().optional().describe("Regular hours worked this period (e.g., 40 for a full week)"),
    overtime_hours: z.number().optional().describe("Overtime hours worked this period"),
    bonus: z.number().optional().describe("Bonus amount in dollars for this period"),
    other_earnings: z.number().optional().describe("Other earnings in dollars for this period"),
    payment_method: z
      .enum(["direct_deposit", "check", "cash"])
      .optional()
      .describe("How the employee is paid (default: check)"),
    notes: z.string().optional().describe("Notes (use 'catch-up' for retroactive payrolls that auto-complete)"),
    confirm_large_payroll: z
      .boolean()
      .optional()
      .describe("Required for direct-deposit payrolls with total net pay >$5,000 or any single net pay >$3,000."),
    confirm_ach_debit: z
      .boolean()
      .optional()
      .describe("Required for first-time direct-deposit payroll or when the last DD authorization is >30 days old."),
    voluntary_set_aside: z
      .object({
        skip: z.boolean().optional().describe("Skip the active set-aside rule for this paycheck only"),
        amount: z.number().min(0).max(9999).optional().describe("Override the rule's computed amount for this paycheck only"),
      })
      .optional()
      .describe(
        "Override or skip the employee's voluntary post-tax set-aside rule for this paycheck only. The recurring rule itself is configured via the dashboard. Omit this field to apply the rule normally."
      ),
    idempotency_key: z
      .string()
      .optional()
      .describe("Unique key to prevent duplicate payroll creation (e.g., 'payroll-2026-04-07-emp123')"),
  },
  {
    title: "Run Payroll",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  async (args) => {
    const result = await executeRunPayroll(args);
    return { content: [{ type: "text" as const, text: result }] };
  }
);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Failed to start NannyKeeper MCP server:", error);
  process.exit(1);
});
