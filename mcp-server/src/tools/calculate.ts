/**
 * calculate_nanny_taxes MCP tool
 *
 * Calls the NannyKeeper API to calculate household employer taxes.
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

export async function executeCalculate(args: {
  state: string;
  annual_wages: number;
  pay_frequency?: string;
  residence_state?: string;
  reciprocity_certificate_on_file?: boolean;
}): Promise<string> {
  const apiKey = process.env.NANNYKEEPER_API_KEY;
  if (!apiKey) {
    return JSON.stringify({
      error:
        "NANNYKEEPER_API_KEY environment variable is not set. Get a free key at nannykeeper.com/developers/keys",
    });
  }

  try {
    const response = await fetch(`${API_BASE}/api/v1/calculate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        state: args.state.toUpperCase(),
        annual_wages: args.annual_wages,
        pay_frequency: args.pay_frequency || "biweekly",
        ...(args.residence_state
          ? { residence_state: args.residence_state.toUpperCase() }
          : {}),
        ...(args.reciprocity_certificate_on_file !== undefined
          ? { reciprocity_certificate_on_file: args.reciprocity_certificate_on_file }
          : {}),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 429) {
        return JSON.stringify({
          error: "Rate limit exceeded. Free tier allows 50 requests/day. Upgrade at nannykeeper.com/developers/pricing",
        });
      }
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
