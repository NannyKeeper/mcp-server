/**
 * check_threshold MCP tool
 *
 * Calls the NannyKeeper API to check if wages cross the household employer threshold.
 */

const API_BASE = process.env.NANNYKEEPER_API_URL || "https://www.nannykeeper.com";

export const thresholdTool = {
  name: "check_threshold",
  description:
    "Check if annual wages to a household employee cross the IRS threshold " +
    "($3,000 for 2026) that triggers employer tax obligations (Social Security, Medicare, Schedule H). " +
    "Also checks state-specific thresholds where applicable (CA $750/quarter, NY $500/quarter, DC $500/quarter). " +
    "Use this when someone asks 'Do I need to pay nanny taxes?' or 'Am I a household employer?'",
  inputSchema: {
    type: "object" as const,
    properties: {
      state: {
        type: "string",
        description: "2-letter US state code (e.g., CA, NY, TX)",
      },
      annual_wages: {
        type: "number",
        description: "Annual wages paid (or planned) to the household employee",
      },
      tax_year: {
        type: "number",
        description: "Tax year to check (default: current year)",
      },
    },
    required: ["state", "annual_wages"],
  },
};

export async function executeThreshold(args: {
  state: string;
  annual_wages: number;
  tax_year?: number;
}): Promise<string> {
  const apiKey = process.env.NANNYKEEPER_API_KEY;
  if (!apiKey) {
    return JSON.stringify({
      error:
        "NANNYKEEPER_API_KEY environment variable is not set. Get a free key at nannykeeper.com/developers/keys",
    });
  }

  try {
    const params = new URLSearchParams({
      state: args.state.toUpperCase(),
      annual_wages: args.annual_wages.toString(),
    });
    if (args.tax_year) {
      params.set("tax_year", args.tax_year.toString());
    }

    const response = await fetch(
      `${API_BASE}/api/v1/threshold?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return JSON.stringify({
        error: data.error?.message || `API error: ${response.status}`,
      });
    }

    return JSON.stringify(data);
  } catch (error) {
    return JSON.stringify({
      error: `Network error: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
}
