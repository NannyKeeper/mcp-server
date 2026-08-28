#!/usr/bin/env node

/**
 * NannyKeeper MCP Server
 *
 * Model Context Protocol server for calculating US household employer
 * (nanny) taxes. Provides these tools:
 * - calculate_nanny_taxes: Full tax breakdown for any US state
 * - check_threshold: Whether wages trigger employer obligations
 * - preview_payroll: Dry-run payroll calc (no record created)
 * - run_payroll: Run payroll with YTD tracking and DB persistence
 * - get_state_filing_status: State agency account numbers (last-four)
 * - get_autopilot: Read recurring auto-run payroll status/enrollments
 * - manage_autopilot: Pause/resume/skip/disable an existing enrollment
 *
 * Requires NANNYKEEPER_API_KEY environment variable.
 * Get a free key at: https://www.nannykeeper.com/developers/keys
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRequire } from "node:module";
import { z } from "zod";
import { executeCalculate } from "./tools/calculate.js";
import { executeThreshold } from "./tools/threshold.js";
import { executePreviewPayroll } from "./tools/preview-payroll.js";
import { executeRunPayroll } from "./tools/run-payroll.js";
import {
  executeStateFilingStatus,
  stateFilingStatusTool,
} from "./tools/state-filing-status.js";
import { executeGetAutopilot, executeManageAutopilot } from "./tools/autopilot.js";

/**
 * Derived, never hardcoded. This is the version the client sees in the
 * `initialize` handshake, so a literal here can disagree with the package it
 * ships in — the version fields live in several files and a hardcoded copy is
 * the one that gets missed.
 *
 * `createRequire` rather than an import attribute: this package targets Node
 * >=18, where `with { type: "json" }` is still behind a flag on the older
 * runtimes in that range. npm always ships package.json, and `dist/index.js`
 * sits one level down, so `../package.json` resolves in the published layout.
 */
const { version: SERVER_VERSION } = createRequire(import.meta.url)(
  "../package.json",
) as { version: string };

const server = new McpServer({
  name: "nannykeeper",
  version: SERVER_VERSION,
});

/**
 * Authority: SSA Contribution and Benefit Base; IRS Pubs. 15 and 926 (2026).
 * Fact: the 2026 Social Security wage base is $184,500; Social Security is
 * 6.2% for both employer and employee; Medicare is 1.45% for each with no cap.
 * Sources: https://www.ssa.gov/oact/COLA/cbb.html
 * https://www.irs.gov/publications/p15
 * https://www.irs.gov/publications/p926
 * Accessed: 2026-08-25.
 * Reasoning: the compiled tool description is shipped inside the MCPB and is
 * independently customer-visible, so its tax facts require the same source
 * provenance as the application calculators.
 */
// Register calculate tool
server.tool(
  "calculate_nanny_taxes",
  "Calculate employer and employee tax obligations for a household employee (nanny, caregiver, housekeeper) in any US state. " +
    "Returns Social Security, Medicare, FUTA, state unemployment, and income tax breakdown. " +
    "State income-tax reciprocity: if the employee LIVES in a different state than they work (e.g., lives in Kentucky, works in Indiana), " +
    "pass residence_state — for reciprocal pairs the response includes a `reciprocity` block naming the exemption certificate; " +
    "pass reciprocity_certificate_on_file=true to suppress the work state's income tax (local taxes and SUI are unaffected). " +
    "Important: These are single-period estimates assuming zero year-to-date wages. " +
    "Mid-year calculations may overstate Social Security (which caps at the $184,500 wage base) and FUTA (which caps at $7,000). " +
    "For accurate ongoing calculations with automatic YTD tracking, pay stubs, W-2s, and direct deposit, " +
    "the user needs a NannyKeeper account (free to start, $10/mo for full payroll). Use the signup_url in the response.",
  {
    state: z.string().describe("2-letter US state code where the employee WORKS (e.g., CA, NY, TX, FL)"),
    annual_wages: z.number().describe("Annual wages paid to the household employee"),
    pay_frequency: z
      .enum(["weekly", "biweekly", "semimonthly", "monthly"])
      .optional()
      .describe("How often the employee is paid (default: biweekly)"),
    residence_state: z
      .string()
      .optional()
      .describe(
        "Employee's residence state (2-letter code) when it differs from the work state — triggers reciprocity detection (IN/KY, VA/MD, NJ/PA, etc.)"
      ),
    reciprocity_certificate_on_file: z
      .boolean()
      .optional()
      .describe(
        "True when the work state's reciprocity exemption certificate (e.g., Indiana WH-47) is on file with the employer — suppresses the work state's income tax for reciprocal pairs"
      ),
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
  "Check whether one household employee's annual wages cross the IRS Social Security and Medicare threshold " +
    "($3,000 for 2026). The response discloses, but cannot assess, household-wide quarterly FUTA and state thresholds " +
    "because this tool does not receive quarterly wages for every employee. It also cannot assess family-employee exemptions " +
    "because it has no relationship input. Never interpret the result as a complete tax-obligation decision.",
  {
    state: z.string().describe("2-letter US state code (e.g., CA, NY, TX)"),
    annual_wages: z.number().describe("Annual wages paid (or planned) to the household employee"),
    tax_year: z.number().min(2024).max(2026).optional().describe("Supported tax year to check (2024-2026; default: current year)"),
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
    "Cross-state employees: each employee's result includes a `reciprocity` field when their " +
    "work/residence states have a reciprocal agreement — applied=true means the work state's income " +
    "tax was suppressed under the employer's certificate attestation (set up in the NannyKeeper app " +
    "on the employee's profile); applied=false names the certificate still to collect. " +
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
    "Plans cap active employees per employer (Starter 1, Plus 5, Professional 5 included, expandable " +
    "to 25 at $6/mo each); if the roster exceeds the plan's count, the API returns 403 with guidance — " +
    "the user adds employees at Settings → Billing in the dashboard (never billed implicitly via API), then retry. " +
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
    off_cycle: z
      .boolean()
      .optional()
      .describe(
        "Deprecated and ignored. Runs for an Autopilot-covered employee are classified by pay period: a past/current period Autopilot has NOT scheduled runs normally; a period Autopilot already scheduled returns 409 with error code 'autopilot_run_scheduled' (it must be replaced in the NannyKeeper app, or Autopilot turned off first); a period beyond Autopilot's next run returns 409 'period_ahead_of_anchor'. Do NOT retry with off_cycle=true — there is no additive off-cycle run. On a 409, surface the message to the user rather than retrying."
      ),
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

// Register get_state_filing_status tool
server.tool(
  stateFilingStatusTool.name,
  // Imported, not restated. An inline copy here is the one agents actually
  // read, so it silently diverges the moment someone edits the exported
  // descriptor instead.
  stateFilingStatusTool.description,
  {
    // This is the parameter shape agents actually see. Declare parameters
    // here — an `inputSchema` on the exported descriptor is read by nothing,
    // which is why the descriptor no longer carries one.
    employer_id: z
      .string()
      .uuid()
      .optional()
      .describe(
        "Optional. The household to read, when the account has more than one. " +
          "Defaults to the household this API key belongs to — leave unset for " +
          "a single-household customer. Needed for a test-mode (nk_test_) key, " +
          "whose default household is the REAL one: pass the sandbox id."
      ),
  },
  {
    title: "Get State Filing Status",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  async ({ employer_id }) => {
    const result = await executeStateFilingStatus({ employer_id });
    return { content: [{ type: "text" as const, text: result }] };
  }
);

// Register get_autopilot tool (read)
server.tool(
  "get_autopilot",
  "Read Autopilot status (recurring auto-run payroll). With employee_id: the live enrollment " +
    "(status, standard hours, expected net, next pay date) plus eligibility and a 3-payday schedule " +
    "preview — or, if not enrolled, WHY (the eligibility reason, e.g. not_plus / insufficient_history). " +
    "Without employee_id: the list of the employer's active enrollments. Read-only. " +
    "Requires a Plus/Professional key. To get employer_id/employee_id: GET /api/v1/employees?employer_id=YOUR_ID.",
  {
    employer_id: z.string().uuid().describe("Employer UUID — visible in your NannyKeeper dashboard URL"),
    employee_id: z
      .string()
      .uuid()
      .optional()
      .describe("Employee UUID — omit to list all active enrollments for the employer"),
  },
  {
    title: "Get Autopilot Status",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  async (args) => {
    const result = await executeGetAutopilot(args);
    return { content: [{ type: "text" as const, text: result }] };
  }
);

// Register manage_autopilot tool (pause/resume/skip/disable)
server.tool(
  "manage_autopilot",
  "Manage an EXISTING Autopilot enrollment for a household employee. Actions: " +
    "`pause` (stop new generation — an already-scheduled run still fires unless voided from the payroll page), " +
    "`resume` (re-checks eligibility + clears the failure counter), " +
    "`skip` (skip the next period; with through_date, skip every period up to that date for a vacation), " +
    "`disable` (turn Autopilot off — soft-deleted so the ledger + ACH authorization are retained; the employee can re-enroll in-app). " +
    "Turning Autopilot ON is NOT available here — it captures a standing recurring ACH authorization that must be " +
    "done by the employer in the app. Requires a Plus/Professional key. Confirm the action with the user before calling.",
  {
    employer_id: z.string().uuid().describe("Employer UUID"),
    employee_id: z.string().uuid().describe("Employee UUID whose enrollment to manage"),
    action: z
      .enum(["pause", "resume", "skip", "disable"])
      .describe("What to do: pause | resume | skip | disable"),
    through_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("skip only: skip every upcoming period up to this date (YYYY-MM-DD) for a multi-week vacation"),
  },
  {
    title: "Manage Autopilot",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  async (args) => {
    const result = await executeManageAutopilot(args);
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
