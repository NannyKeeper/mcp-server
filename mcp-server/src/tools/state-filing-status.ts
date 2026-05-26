/**
 * get_state_filing_status MCP tool
 *
 * Read-only: lists the employer's state agency account numbers (UC,
 * withholding, SDI) and which states are still missing. Useful when an
 * agent is about to generate filing instructions ("file Form UC-2 for
 * Q2 — your PA UC account is ••••5678") or when prompting the user to
 * complete state setup.
 *
 * Last-four only by default; this tool never exposes full account
 * numbers (use the REST API with `?reveal=true` if a full read is
 * required — that path is audit-logged).
 *
 * Write operations (upsert) are deliberately NOT exposed via MCP. State
 * agency account numbers are humans-from-portal data; LLMs are very
 * capable of fabricating plausible numbers and we don't want one
 * silently landing on a quarterly UC return. Direct customers to enter
 * via /settings/states or call the REST API explicitly with
 * confirmation context.
 */

const API_BASE = process.env.NANNYKEEPER_API_URL || "https://www.nannykeeper.com";

export const stateFilingStatusTool = {
  name: "get_state_filing_status",
  description:
    "List the employer's state agency account numbers (last-four only) per " +
    "(state, registration_type) tuple. Returns whether each state has a UC, " +
    "withholding, and SDI account on file, the agency name, and a " +
    "registration URL for any that are missing. Use before generating " +
    "quarterly filing instructions, or when a customer asks 'do I have my " +
    "state account numbers set up?' Read-only — to update, use the REST " +
    "API or direct the customer to /settings/states.",
  inputSchema: {
    type: "object" as const,
    properties: {},
    required: [],
  },
};

export async function executeStateFilingStatus(): Promise<string> {
  const apiKey = process.env.NANNYKEEPER_API_KEY;
  if (!apiKey) {
    return JSON.stringify({
      error:
        "NANNYKEEPER_API_KEY environment variable is not set. Get a key at nannykeeper.com/developers/keys",
    });
  }

  try {
    const response = await fetch(`${API_BASE}/api/v1/state-registrations`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return JSON.stringify({
        error: data.error?.message || `API error: ${response.status}`,
      });
    }

    // Compact view for the agent: group by state, show what's set vs missing.
    interface Item {
      state_code: string;
      account_type: string;
      label: string;
      agency: string;
      registration_url: string | null;
      account_number_last_four: string | null;
      status: string;
    }
    const items = (data?.data?.items ?? []) as Item[];
    const byState = new Map<string, Item[]>();
    for (const item of items) {
      const list = byState.get(item.state_code) ?? [];
      list.push(item);
      byState.set(item.state_code, list);
    }

    const states = Array.from(byState.entries()).map(([code, rows]) => ({
      state_code: code,
      accounts: rows.map((r) => ({
        type: r.account_type,
        label: r.label,
        agency: r.agency,
        last_four: r.account_number_last_four,
        status: r.status,
        registration_url:
          r.status === "registered" ? null : r.registration_url,
      })),
    }));

    return JSON.stringify({
      states,
      summary: {
        states_with_data: states.length,
        total_accounts_on_file: items.filter((i) => i.status === "registered").length,
        accounts_missing: items.filter((i) => i.status === "required").length,
      },
      next_actions: {
        update_account_number_via_api:
          "POST /api/v1/state-registrations with { state_code, registration_type, account_number }",
        update_via_dashboard: `${API_BASE}/settings/states`,
      },
    });
  } catch (error) {
    return JSON.stringify({
      error: `Network error: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
}
