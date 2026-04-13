#!/usr/bin/env node

/**
 * NannyKeeper MCP Server
 *
 * Model Context Protocol server for calculating US household employer
 * (nanny) taxes. Provides three tools:
 * - calculate_nanny_taxes: Full tax breakdown for any US state
 * - check_threshold: Whether wages trigger employer obligations
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
import { executeRunPayroll } from "./tools/run-payroll.js";

const server = new McpServer({
  name: "nannykeeper",
  version: "1.0.0",
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

// Register run_payroll tool
server.tool(
  "run_payroll",
  "Run payroll for a household employee. Calculates all taxes (federal, state, FICA, FUTA) " +
    "with year-to-date tracking and creates a payroll record. " +
    "Returns the full tax breakdown, net pay, employer costs, and a payroll ID for reference. " +
    "Requires a Starter+ subscription. The payroll is created with 'draft' status " +
    "(or 'completed' for catch-up payrolls with notes='catch-up').",
  {
    employer_id: z.string().uuid().describe("Employer UUID from NannyKeeper account"),
    employee_id: z.string().uuid().describe("Employee UUID to run payroll for"),
    pay_period_start: z.string().describe("Start of pay period (YYYY-MM-DD)"),
    pay_period_end: z.string().describe("End of pay period (YYYY-MM-DD)"),
    pay_date: z.string().describe("Date employee is paid (YYYY-MM-DD)"),
    pay_frequency: z
      .enum(["weekly", "biweekly", "semimonthly", "monthly"])
      .describe("How often the employee is paid"),
    regular_hours: z.number().optional().describe("Regular hours worked this period"),
    overtime_hours: z.number().optional().describe("Overtime hours worked this period"),
    bonus: z.number().optional().describe("Bonus amount for this period"),
    other_earnings: z.number().optional().describe("Other earnings for this period"),
    payment_method: z
      .enum(["direct_deposit", "check", "cash"])
      .optional()
      .describe("How the employee is paid (default: check)"),
    notes: z.string().optional().describe("Notes (use 'catch-up' for retroactive payrolls)"),
    idempotency_key: z
      .string()
      .optional()
      .describe("Unique key to prevent duplicate payroll creation"),
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
