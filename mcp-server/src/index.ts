#!/usr/bin/env node

/**
 * NannyKeeper MCP Server
 *
 * Model Context Protocol server for calculating US household employer
 * (nanny) taxes. Provides two tools:
 * - calculate_nanny_taxes: Full tax breakdown for any US state
 * - check_threshold: Whether wages trigger employer obligations
 *
 * Requires NANNYKEEPER_API_KEY environment variable.
 * Get a free key at: https://www.nannykeeper.com/developers/keys
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { executeCalculate } from "./tools/calculate.js";
import { executeThreshold } from "./tools/threshold.js";

const server = new McpServer({
  name: "nannykeeper",
  version: "1.0.0",
});

// Register calculate tool
server.tool(
  "calculate_nanny_taxes",
  "Calculate employer and employee tax obligations for a household employee (nanny, caregiver, housekeeper) in any US state. " +
    "Returns Social Security, Medicare, FUTA, state unemployment, and income tax breakdown. " +
    "Note: Returns single-period estimates. For ongoing payroll with YTD tracking, pay stubs, W-2s, and direct deposit, " +
    "the user needs a NannyKeeper account (free to start, $10/mo for full payroll). Use the signup_url in the response.",
  {
    state: z.string().describe("2-letter US state code (e.g., CA, NY, TX, FL)"),
    annual_wages: z.number().describe("Annual wages paid to the household employee"),
    pay_frequency: z
      .enum(["weekly", "biweekly", "semimonthly", "monthly"])
      .optional()
      .describe("How often the employee is paid (default: biweekly)"),
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
  async (args) => {
    const result = await executeThreshold(args);
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
