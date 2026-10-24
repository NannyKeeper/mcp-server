import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { executeCalculate } from "./tools/calculate.ts";
import { executeThreshold } from "./tools/threshold.ts";
import { executePreviewPayroll } from "./tools/preview-payroll.ts";
import { executeRunPayroll } from "./tools/run-payroll.ts";
import {
  executeStateFilingStatus,
  stateFilingStatusTool,
} from "./tools/state-filing-status.ts";
import { executeGetAutopilot, executeManageAutopilot } from "./tools/autopilot.ts";
import { reimbursementsParam } from "./tools/reimbursements.ts";
import { registerListPayrolls } from "./tools/list-payrolls.ts";
import { registerVoidPayroll } from "./tools/void-payroll.ts";
import { EMPLOYER_ID_OPTIONAL } from "./params.ts";
import {
  executeGetPayStub,
  executeGetW2,
  executeGetScheduleH,
  executeGetQuarterTaxes,
  executeGetPayroll,
  executeListEmployees,
} from "./tools/household.ts";

import type { ToolContext } from "./context.ts";
import { publicDescriptions, toolResult } from "./public-profile.ts";
import { registerRecordTaxPayment } from "./tools/tax-payment.ts";


/**
 * Cap on array elements plus object members in one tools/call `arguments`
 * (GHSA-46jr-4wx8-v453). The SDK counts them before validation and
 * has no limit unless one is set, so an object with tens of thousands of keys
 * inside the 64KB body cap could exhaust memory. The one array input is
 * `reimbursements` on preview_payroll and run_payroll: at most 10 lines of 5
 * members, so the widest call (run_payroll, about 22 members plus 10 + 50 for
 * a full set of lines) stays near 85, and 256 refuses nothing real. A test
 * sends the largest valid run_payroll call through the real server to hold
 * that. Raise this if an input grows past it.
 */
export const MAX_TOOL_INPUT_ELEMENTS = 256;

/** A fresh server and credential closure for each hosted request. */
export function createNannyKeeperServer(version: string, context?: ToolContext) {
const server = new McpServer({ name: "nannykeeper", version }, { maxToolInputElements: MAX_TOOL_INPUT_ELEMENTS });

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
  context?.publicConnection ? publicDescriptions.calculate_nanny_taxes : (
  "Calculate employer and employee tax obligations for a household employee (nanny, caregiver, housekeeper) in any US state. " +
    "Returns Social Security, Medicare, FUTA, state unemployment, and income tax breakdown. " +
    "State income-tax reciprocity: if the employee LIVES in a different state than they work (e.g., lives in Kentucky, works in Indiana), " +
    "pass residence_state — for reciprocal pairs the response includes a `reciprocity` block naming the exemption certificate; " +
    "pass reciprocity_certificate_on_file=true to suppress the work state's income tax (local taxes and SUI are unaffected). " +
    "Important: These are annual estimates from annual_wages, with derived per-paycheck amounts. " +
    "They do not read an existing employee's year-to-date payroll records; use preview_payroll for an existing employee. " +
    "This tool has no family-relationship or age input, so Social Security, Medicare and FUTA are quoted as if no " +
    "family-employee exemption (Social Security, Medicare and FUTA) or under-18 exemption (Social Security and " +
    "Medicare only) applies, and FUTA's household quarterly test is reported as unassessed. " +
    "threshold.action_required is true when the FICA wage test is met and null otherwise, never false: present null as " +
    "not determined, not as nothing owed, and pass on the response's limitations. " +
    "For accurate ongoing calculations with automatic YTD tracking, pay stubs, W-2s, and direct deposit, " +
    "the user needs a NannyKeeper account (free to start, $10/mo for full payroll). Use the signup_url in the response."
  ),
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
    const result = await executeCalculate(args, context);
    return toolResult(result, context?.publicConnection);
  }
);

// Register threshold tool
server.tool(
  "check_threshold",
  context?.publicConnection ? publicDescriptions.check_threshold : (
  "Check whether one household employee's annual wages cross the IRS Social Security and Medicare threshold " +
    "($3,000 for 2026). The response discloses, but cannot assess, household-wide quarterly FUTA and state thresholds " +
    "because this tool does not receive quarterly wages for every employee. It also cannot assess family-employee exemptions " +
    "because it has no relationship input. federal.action_required is true when the FICA wage test is met and null " +
    "otherwise, never false; null means not determined, not nothing owed. " +
    "Never interpret the result as a complete tax-obligation decision."
  ),
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
    const result = await executeThreshold(args, context);
    return toolResult(result, context?.publicConnection);
  }
);

// Register preview_payroll tool
server.tool(
  "preview_payroll",
  context?.publicConnection ? publicDescriptions.preview_payroll : (
  "Preview payroll for a household employee WITHOUT creating a record. " +
    "Returns the full tax breakdown (federal, state, FICA, FUTA), net pay, and employer costs. " +
    "Cross-state employees: each employee's result includes a `reciprocity` field when their " +
    "work/residence states have a reciprocal agreement — applied=true means the work state's income " +
    "tax was suppressed under the employer's certificate attestation (set up in the NannyKeeper app " +
    "on the employee's profile); applied=false names the certificate still to collect. " +
    "Mileage and other reimbursements go in reimbursements, the same lines run_payroll takes. " +
    "Use this to validate your request before calling run_payroll. " +
    "Same parameters as run_payroll. Requires a Starter+ subscription. " +
    "pay_date is optional. When omitted, the server picks the earliest valid business day on or " +
    "after pay_period_end, allowing for ACH submission lead time, and echoes it back in the response. " +
    "v1.5.0: if pay_date is more than 5 business days in the future, the response includes " +
    "is_estimated=true — those numbers will be recomputed at fire time if the user schedules. " +
    "Get employee_id from list_employees. employer_id is optional: leave it out and the API uses " +
    "the household your API key belongs to (pass it only when one account manages several households)."
  ),
  {
    employer_id: EMPLOYER_ID_OPTIONAL,
    employee_id: z.string().uuid().describe("Employee UUID. Get it from list_employees."),
    pay_period_start: z.string().describe("Start of pay period in YYYY-MM-DD format (e.g., 2026-04-07)"),
    pay_period_end: z.string().describe("End of pay period in YYYY-MM-DD format (e.g., 2026-04-13)"),
    pay_date: z.string().optional().describe("Date employee is paid (YYYY-MM-DD), on or after pay_period_end. Optional: if omitted, the server picks the earliest valid business day on or after pay_period_end."),
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
    reimbursements: reimbursementsParam,
  },
  {
    title: "Preview Payroll",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  async (args) => {
    const result = await executePreviewPayroll(args, context);
    return toolResult(result, context?.publicConnection);
  }
);

// Register run_payroll tool
server.tool(
  "run_payroll",
  context?.publicConnection ? publicDescriptions.run_payroll : (
  "Run payroll for a household employee end-to-end in a single call. Creates the " +
    "record, runs all tax calculations (federal, state, FICA, FUTA) with year-to-date " +
    "tracking, approves the payroll, and kicks off payment processing. " +
    "Returns the finalized status (processing/pending_funding/completed/scheduled) plus full tax breakdown, " +
    "net pay, employer costs, and the payroll ID for reference. " +
    "Requires a Starter+ subscription. " +
    "Plans cap active employees per employer (Starter 1, Plus 5, Professional 5 included, expandable " +
    "to 25 at $6/mo each); if the roster exceeds the plan's count, the API returns 403 with guidance — " +
    "the user adds employees at Settings → Billing in the dashboard (never billed implicitly via API), then retry. " +
    "pay_date is optional. When omitted, the server picks the earliest valid business day on or " +
    "after pay_period_end, allowing for ACH submission lead time, and echoes it back. If supplied and past the " +
    "submission deadline, the request is rejected with next_valid_pay_date in the error. " +
    "If pay_date is more than 5 business days in the future on a DD payroll, status=scheduled " +
    "and the payroll will auto-fire at scheduled_send_at (5 biz days before pay_date). " +
    "Scheduled responses include is_estimated=true — numbers may shift slightly at fire time " +
    "if YTD or rate configs change between approve and fire. " +
    "Direct deposit callers: set confirm_large_payroll=true for totals >$5,000 or any single " +
    "net pay >$3,000; set confirm_ach_debit=true for first-time DD or if no DD in 30 days. " +
    "Mileage, transit, parking and other reimbursements: pass up to 10 lines in reimbursements. For mileage send " +
    "type mileage, the miles and amount 0, and NannyKeeper prices the miles at the IRS rate it holds for the pay " +
    "period and pay date unless you pass rate_per_mile; a year it holds no rate for is refused with mileage_rate_unavailable. " +
    "Tip: use preview_payroll first to validate your request and see results before committing. " +
    "Get employee_id from list_employees. employer_id is optional: leave it out and the API uses " +
    "the household your API key belongs to (pass it only when one account manages several households)."
  ),
  {
    employer_id: EMPLOYER_ID_OPTIONAL,
    employee_id: z.string().uuid().describe("Employee UUID. Get it from list_employees."),
    pay_period_start: z.string().describe("Start of pay period in YYYY-MM-DD format (e.g., 2026-04-07)"),
    pay_period_end: z.string().describe("End of pay period in YYYY-MM-DD format (e.g., 2026-04-13)"),
    pay_date: z.string().optional().describe("Date employee is paid (YYYY-MM-DD), on or after pay_period_end. Optional: if omitted, the server picks the earliest valid business day on or after pay_period_end."),
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
    reimbursements: reimbursementsParam,
    idempotency_key: context?.publicConnection ? z.string().trim().min(1).max(255).describe("Unique key for this approved payroll. Reuse the same key with identical inputs when retrying.") : z
      .string()
      .optional()
      .describe("Unique key to prevent duplicate payroll creation (e.g., 'payroll-2026-04-07-emp123')"),
  },
  {
    title: "Run Payroll",
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
  async (args) => {
    const result = await executeRunPayroll(args, context);
    return toolResult(result, context?.publicConnection);
  }
);

// Register get_state_filing_status tool
server.tool(
  stateFilingStatusTool.name,
  // Imported, not restated. An inline copy here is the one agents actually
  // read, so it silently diverges the moment someone edits the exported
  // descriptor instead.
  context?.publicConnection ? publicDescriptions.get_state_filing_status : stateFilingStatusTool.description,
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
    const result = await executeStateFilingStatus({ employer_id }, context);
    return toolResult(result, context?.publicConnection);
  }
);

// Register get_autopilot tool (read)
server.tool(
  "get_autopilot",
  context?.publicConnection ? publicDescriptions.get_autopilot : (
  "Read Autopilot status (recurring auto-run payroll). With employee_id: the live enrollment " +
    "(status, standard hours, expected net, next pay date) plus eligibility and a 3-payday schedule " +
    "preview — or, if not enrolled, WHY (the eligibility reason, e.g. not_plus / insufficient_history). " +
    "Without employee_id: the list of the employer's active enrollments. Read-only. " +
    "Requires a Plus/Professional key. Get employee_id from list_employees; employer_id is optional."
  ),
  {
    employer_id: EMPLOYER_ID_OPTIONAL,
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
    const result = await executeGetAutopilot(args, context);
    return toolResult(result, context?.publicConnection);
  }
);

// Register manage_autopilot tool (pause/resume/skip/disable)
server.tool(
  "manage_autopilot",
  context?.publicConnection ? publicDescriptions.manage_autopilot : (
  "Manage an EXISTING Autopilot enrollment for a household employee. Actions: " +
    "`pause` (stop new generation — an already-scheduled run still fires unless voided from the payroll page), " +
    "`resume` (re-checks eligibility + clears the failure counter), " +
    "`skip` (skip the next period; with through_date, skip every period up to that date for a vacation), " +
    "`disable` (turn Autopilot off — soft-deleted so the ledger + ACH authorization are retained; the employee can re-enroll in-app). " +
    "Turning Autopilot ON is NOT available here — it captures a standing recurring ACH authorization that must be " +
    "done by the employer in the app. Requires a Plus/Professional key. Confirm the action with the user before calling."
  ),
  {
    employer_id: EMPLOYER_ID_OPTIONAL,
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
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
  async (args) => {
    const result = await executeManageAutopilot(args, context);
    return toolResult(result, context?.publicConnection);
  }
);

// Register list_employees tool (read, 1.15.0)
server.tool(
  "list_employees",
  context?.publicConnection ? publicDescriptions.list_employees : (
  "List the household's employees and return the household's employer_id. Call this first: it is how you get " +
    "the employee_id every payroll tool needs. Each employee shows pay type, pay rate, pay frequency, work state, " +
    "and what is still missing for payroll (W-4, address, SSN, direct deposit). Read-only."
  ),
  {
    employer_id: EMPLOYER_ID_OPTIONAL,
  },
  {
    title: "List Employees",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  async (args) => {
    const result = await executeListEmployees(args, context);
    return toolResult(result, context?.publicConnection);
  }
);

// Register get_payroll tool (read, 1.15.0)
server.tool(
  "get_payroll",
  context?.publicConnection ? publicDescriptions.get_payroll : (
  "Read payrolls. With payroll_id: that payroll's status, dates, and each employee's gross pay, every deduction " +
    "(federal, Social Security, Medicare, state, local), net pay, and employer taxes. Without payroll_id: the " +
    "household's payrolls, newest first, with totals (list_payrolls filters that list by employee and pay date). " +
    "Use it to confirm what run_payroll created. For a paycheck the family pays outside NannyKeeper, paid_outside gives " +
    "family_method (how the family says it paid) and confirmation: confirmed, mismatch (the employee said it does not " +
    "match what arrived; NannyKeeper does not know the difference, so suggest the two of them talk), waiting, or " +
    "not_asked. A missing confirmation is never a problem. Read-only."
  ),
  {
    payroll_id: z.string().uuid().optional().describe("A payroll id from run_payroll. Leave it out to list payrolls."),
    employer_id: EMPLOYER_ID_OPTIONAL,
  },
  {
    title: "Get Payroll",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  async (args) => {
    const result = await executeGetPayroll(args, context);
    return toolResult(result, context?.publicConnection);
  }
);

// Register get_pay_stub tool (read, 1.15.0)
server.tool(
  "get_pay_stub",
  context?.publicConnection ? publicDescriptions.get_pay_stub : (
  "Get the pay stub PDF for each employee on a paid payroll. Returns the same stub the family downloads in the " +
    "dashboard, attached as a PDF file, plus a short summary. A payroll that is not paid yet answers " +
    "payroll_not_completed; check get_payroll and ask again once it is completed. For a household other " +
    "than the key's own, pass its employer_id."
  ),
  {
    payroll_id: z.string().uuid().describe("The payroll id from run_payroll or get_payroll."),
    employee_id: z.string().uuid().optional().describe("Optional. One employee's stub instead of everyone's on the payroll."),
    employer_id: EMPLOYER_ID_OPTIONAL,
  },
  {
    title: "Get Pay Stub",
    // Not read-only: the first request for a stub saves it, as the dashboard's
    // download does. Safe to repeat.
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  async (args) => {
    const result = await executeGetPayStub(args, context);
    // Errors go through toolResult like every other tool, so a hosted
    // connection gets the same scrubbing.
    if (result.isError) {
      const text = result.content.find((c) => c.type === "text");
      return toolResult(text && "text" in text ? text.text : JSON.stringify({ error: "Unknown error" }), context?.publicConnection);
    }
    return result;
  }
);

// ⛔ get_w2 and get_schedule_h return a download LINK, never the PDF, on the
// hosted connector and the npm package alike. A
// W-2 prints the employee's full Social Security number and a tool result is
// read by the assistant's model, so the form goes from NannyKeeper to the
// person's browser and the assistant only passes the link along.

// Register get_w2 tool (1.16.0)
server.tool(
  "get_w2",
  context?.publicConnection ? publicDescriptions.get_w2 : (
  "Get a download link for one copy of an employee's W-2, for a tax year that has ended. Returns download_url, " +
    "a link on nannykeeper.com that works for 15 minutes: give it to the user and tell them to open it in their " +
    "browser to download the PDF. This tool never returns the PDF itself, and you must not open the link " +
    "yourself. The family generates the W-2 in the dashboard first (Taxes, then W-2s); until then this answers " +
    "w2_not_generated with a link to that page, and this tool never generates one. " +
    "For a household other than the key's own, pass its employer_id."
  ),
  {
    employee_id: z.string().uuid().describe("The employee id from list_employees."),
    tax_year: z.number().int().describe("A tax year that has ended, for example 2025."),
    copy: z.enum(["A", "B", "C", "D", "1", "2"]).optional().describe("Optional. Which copy of the W-2. Defaults to B. Each PDF says on its face who that copy is for."),
    employer_id: EMPLOYER_ID_OPTIONAL,
  },
  {
    title: "Get W-2 Download Link",
    // Not read-only: making a link writes an audit row. Safe to repeat.
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  async (args) => toolResult(await executeGetW2(args, context), context?.publicConnection)
);

// Register get_schedule_h tool (1.16.0)
server.tool(
  "get_schedule_h",
  context?.publicConnection ? publicDescriptions.get_schedule_h : (
  "Get a download link for the household's Schedule H, for a tax year that has ended. Returns download_url, a " +
    "link on nannykeeper.com that works for 15 minutes: give it to the user and tell them to open it in their " +
    "browser to download the PDF. This tool never returns the PDF itself, and you must not open the link " +
    "yourself. When the dashboard would not produce the form this answers schedule_h_unavailable with a reason " +
    "(for example year_not_ended, or a question the family still has to answer in the dashboard); report that " +
    "reason faithfully. NannyKeeper does not file the form. " +
    "For a household other than the key's own, pass its employer_id."
  ),
  {
    tax_year: z.number().int().describe("A tax year that has ended, for example 2025."),
    employer_id: EMPLOYER_ID_OPTIONAL,
  },
  {
    title: "Get Schedule H Download Link",
    // Not read-only: making a link writes an audit row. Safe to repeat.
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  async (args) => toolResult(await executeGetScheduleH(args, context), context?.publicConnection)
);

registerListPayrolls(server, context);

// Register get_quarter_taxes tool (read, 1.17.0)
server.tool(
  "get_quarter_taxes",
  context?.publicConnection ? publicDescriptions.get_quarter_taxes : (
  "Get a quarter's tax figures as the household's Taxes page shows them: `items` is the checklist of what to " +
    "pay or file, to whom and by when (an item of kind `rec` has no hard deadline this quarter but may still be " +
    "owed); `federal` is the optional estimated payment (Form 1040-ES) for the IRS installment in " +
    "`installment_period`, which settles on Schedule H with Form 1040; `state_destinations` is each state " +
    "agency with its due date and what is owed; `state_lines` is " +
    "wages and each state and local line. Amounts are dollars. A null amount means NannyKeeper will not stand " +
    "behind a figure yet: say so and give the reason (`waiting_on`, `fica`, `rate_needed`), and never report it " +
    "as $0 or as nothing owed. NannyKeeper does not file or pay for the household. " +
    "For a household other than the key's own, pass its employer_id."
  ),
  {
    year: z.number().int().min(2020).max(2100).describe("The tax year, for example 2026."),
    quarter: z.number().int().min(1).max(4).describe("The calendar quarter, 1 to 4."),
    employer_id: EMPLOYER_ID_OPTIONAL,
  },
  {
    title: "Get Quarter Taxes",
    // Not strictly read-only: like opening the Taxes page, it refreshes the
    // quarter's stored totals. It never changes a payroll. Safe to repeat.
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  async (args) => toolResult(await executeGetQuarterTaxes(args, context), context?.publicConnection)
);

// record_tax_payment (write), registered from its own module.
registerRecordTaxPayment(server, context, EMPLOYER_ID_OPTIONAL);

registerVoidPayroll(server, context);

return server;
}
