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

/**
 * The single definition of this tool's name and description. `index.ts` imports
 * it rather than restating it: an inline copy there is the one agents actually
 * read, so edits made here would never reach a model.
 */
export const stateFilingStatusTool = {
  name: "get_state_filing_status",
  description:
    "List the employer's state agency account numbers (last-four only) per " +
    "(state, registration_type) tuple. Returns whether each state has a UC, " +
    "withholding, and SDI account on file, and the agency name. Each " +
    "account has a status: registered, pending, required, or not_required. " +
    "A registration URL is returned for status=required and status=pending — " +
    "the accounts the employer still has to open or finish. It is null for " +
    "status=registered and status=not_required. status=not_required means " +
    "this household does not owe that registration (e.g. they and their " +
    "employee agreed not to withhold state income tax), so never tell them " +
    "to go register for it. Use before generating " +
    "quarterly filing instructions, or when a customer asks 'do I have my " +
    "state account numbers set up?' Read-only — to update, use the REST " +
    "API or direct the customer to /settings/states.",
  // No `inputSchema` here on purpose: `index.ts` passes its own zod shape to
  // `server.tool()`, so a declaration here would reach no agent. Declare
  // parameters there.
};

/**
 * The `employer_id` passthrough is required, not optional plumbing.
 *
 * `/api/v1/state-registrations` enforces the test/live boundary, and an API
 * key's stored household is always the real one. A server configured with a
 * `nk_test_` key and no way to name a household would therefore be refused on
 * every call, with no way to reach the sandbox it is meant to work against.
 */
export async function executeStateFilingStatus(args?: {
  employer_id?: string;
}): Promise<string> {
  const apiKey = process.env.NANNYKEEPER_API_KEY;
  if (!apiKey) {
    return JSON.stringify({
      error:
        "NANNYKEEPER_API_KEY environment variable is not set. Get a key at nannykeeper.com/developers/keys",
    });
  }

  try {
    const url = new URL(`${API_BASE}/api/v1/state-registrations`);
    if (args?.employer_id) {
      url.searchParams.set("employer_id", args.employer_id);
    }

    const response = await fetch(url, {
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
        // ⛔ `not_required` joins `registered` here. The upstream
        // route already nulls it, so this is belt-and-braces — but this tool
        // is what an agent actually reads, and handing it a URL for a
        // registration we just said is not required is how the agent ends up
        // nagging the family about an account they do not need.
        registration_url:
          r.status === "registered" || r.status === "not_required"
            ? null
            : r.registration_url,
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
