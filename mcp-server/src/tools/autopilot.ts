/**
 * Autopilot MCP tools (manage-only).
 *
 * Autopilot = opt-in recurring auto-run of payroll. The MCP surface can READ
 * status/history and MANAGE an existing enrollment (pause / resume / skip /
 * disable). Enrollment itself is intentionally NOT exposed — turning Autopilot
 * on captures a standing recurring ACH authorization that must be employer-
 * driven in the app. Requires a Plus/Professional key (the `ach` scope).
 */

const API_BASE = process.env.NANNYKEEPER_API_URL || "https://www.nannykeeper.com";

function missingKey(): string {
  return JSON.stringify({
    error:
      "NANNYKEEPER_API_KEY environment variable is not set. Autopilot management requires a Plus/Professional key: nannykeeper.com/developers/keys",
  });
}

/** Read Autopilot status for one employee, or list the employer's active enrollments. */
export async function executeGetAutopilot(args: {
  employer_id: string;
  employee_id?: string;
}): Promise<string> {
  const apiKey = process.env.NANNYKEEPER_API_KEY;
  if (!apiKey) return missingKey();

  try {
    const params = new URLSearchParams({ employer_id: args.employer_id });
    if (args.employee_id) params.set("employee_id", args.employee_id);
    const response = await fetch(`${API_BASE}/api/v1/autopilot?${params.toString()}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await response.json();
    if (!response.ok) {
      return JSON.stringify({ error: data.error?.message || `API error: ${response.status}` });
    }
    return JSON.stringify(data);
  } catch (error) {
    return JSON.stringify({
      error: `Network error: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
}

/** Manage an existing enrollment: pause / resume / skip / disable. */
export async function executeManageAutopilot(args: {
  employer_id: string;
  employee_id: string;
  action: "pause" | "resume" | "skip" | "disable";
  through_date?: string;
}): Promise<string> {
  const apiKey = process.env.NANNYKEEPER_API_KEY;
  if (!apiKey) return missingKey();

  try {
    const body: Record<string, unknown> = {
      employer_id: args.employer_id,
      employee_id: args.employee_id,
    };
    if (args.action === "skip" && args.through_date) {
      body.through_date = args.through_date;
    }
    const response = await fetch(`${API_BASE}/api/v1/autopilot/${args.action}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) {
      return JSON.stringify({ error: data.error?.message || `API error: ${response.status}` });
    }
    return JSON.stringify(data);
  } catch (error) {
    return JSON.stringify({
      error: `Network error: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
}
