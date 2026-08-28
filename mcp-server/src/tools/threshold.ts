/**
 * check_threshold MCP tool
 *
 * Calls the NannyKeeper API to check one worker's annual FICA threshold.
 */

const API_BASE = process.env.NANNYKEEPER_API_URL || "https://www.nannykeeper.com";

/**
 * ⛔ THE DESCRIPTOR CONST THAT USED TO LIVE HERE WAS DEAD AND HAS BEEN REMOVED.
 *
 * `index.ts` registers this tool with its own description, so the exported
 * const was imported by nothing — and had already drifted from the shipped
 * text in both directions. It has already bitten the sibling tool once: a
 * customer-facing prompt was rewritten in the dead copy while every agent kept
 * reading the stale live one.
 *
 * If you want a single definition here, export it AND import it in `index.ts`
 * (see `state-filing-status.ts`, which now does). A second copy nobody reads is
 * worse than no copy: it looks like the source of truth and silently is not.
 */

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
