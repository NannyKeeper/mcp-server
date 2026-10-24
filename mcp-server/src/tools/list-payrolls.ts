/**
 * list_payrolls: the household's payrolls, newest first, from
 * `GET /api/v1/payrolls`, filtered by employee and by pay date.
 *
 * It answers "what did I pay her last time?" and "list my last three
 * payrolls" without an id the agent would otherwise need from somewhere.
 * get_payroll still reads one payroll in full; this tool is the index.
 *
 * Registered from its own module (one tool per file) so a new tool never has
 * to edit another's registration.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CLIENT_HEADER, getToolContext, type ToolContext } from "../context.ts";
import { EMPLOYER_ID_OPTIONAL } from "../params.ts";
import { toolResult } from "../public-profile.ts";

export const LIST_PAYROLLS_DESCRIPTION =
  "List the household's payrolls, newest first, each with its status, pay period, pay date, total gross pay, " +
  "total net pay, employer taxes, the employee_ids it paid and paid_outside_confirmation (for paychecks paid outside " +
  "NannyKeeper: confirmed, mismatch, waiting, or null when nobody was asked). Filter with employee_id (only payrolls that paid " +
  "that employee) and pay_date_from / pay_date_to (inclusive pay-date range, YYYY-MM-DD). Use limit for " +
  '"the last three payrolls" (limit: 3). When has_more is true, pass next_cursor back as cursor for the next ' +
  "page; a cursor it did not issue answers invalid_cursor, so start again without one. Totals are for the whole payroll; call get_payroll with a payroll id for each employee's gross pay, " +
  "deductions and net pay. Report the exact status: scheduled or processing does not mean paid, and a voided " +
  "payroll paid nothing. An employee_id that is not in this household answers not_found. Read-only.";

/** The hosted listing's copy: no account or plan prompts, same facts. */
export const LIST_PAYROLLS_PUBLIC_DESCRIPTION =
  "List the household's payrolls, newest first, with status, pay period, pay date, totals and the employee IDs " +
  "each one paid. Filter by employee_id and by an inclusive pay-date range (pay_date_from, pay_date_to). Use " +
  "limit for the most recent few, and pass next_cursor back as cursor for more. Use get_payroll for one " +
  "payroll's per-employee figures. Report the exact status; scheduled or processing does not mean paid. Read-only.";

/** A real calendar date, as the API's own pay-date rule requires. */
const DATE = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((value) => {
    const [y, m, d] = value.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  }, "Must be a real calendar date");

export interface ListPayrollsArgs {
  employer_id?: string;
  employee_id?: string;
  pay_date_from?: string;
  pay_date_to?: string;
  limit?: number;
  cursor?: string;
}

export async function executeListPayrolls(args: ListPayrollsArgs, context?: ToolContext): Promise<string> {
  // The API refuses a range that runs backwards; say so without a round trip.
  if (args.pay_date_from && args.pay_date_to && args.pay_date_from > args.pay_date_to) {
    return JSON.stringify({ error: "pay_date_from must be on or before pay_date_to", code: "validation_error" });
  }
  const { apiKey, apiBase } = getToolContext(context);
  if (!apiKey) {
    return JSON.stringify({
      error: "NANNYKEEPER_API_KEY environment variable is not set. Get a key at nannykeeper.com/developers/keys",
    });
  }
  const params = new URLSearchParams();
  for (const key of ["employer_id", "employee_id", "pay_date_from", "pay_date_to", "cursor"] as const) {
    const value = args[key];
    if (value) params.set(key, value);
  }
  if (args.limit !== undefined) params.set("limit", String(args.limit));
  const query = params.toString();
  try {
    const response = await fetch(`${apiBase}/api/v1/payrolls${query ? `?${query}` : ""}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}`, ...CLIENT_HEADER },
    });
    const data = await response.json();
    if (!response.ok) {
      return JSON.stringify({
        error: data.error?.message || `API error: ${response.status}`,
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

export function registerListPayrolls(server: McpServer, context?: ToolContext) {
  server.tool(
    "list_payrolls",
    context?.publicConnection ? LIST_PAYROLLS_PUBLIC_DESCRIPTION : LIST_PAYROLLS_DESCRIPTION,
    {
      employee_id: z.string().uuid().optional().describe("Optional. Only payrolls that paid this employee. Get it from list_employees."),
      pay_date_from: DATE.optional().describe("Optional. Earliest pay date to include, YYYY-MM-DD."),
      pay_date_to: DATE.optional().describe("Optional. Latest pay date to include, YYYY-MM-DD."),
      limit: z.number().int().min(1).max(100).optional().describe("Optional. How many payrolls to return, 1 to 100 (default 25)."),
      cursor: z.string().max(200).optional().describe("Optional. The next_cursor from a previous call, for the next page."),
      employer_id: EMPLOYER_ID_OPTIONAL,
    },
    {
      title: "List Payrolls",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args) => toolResult(await executeListPayrolls(args, context), context?.publicConnection),
  );
}
