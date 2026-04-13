/**
 * run_payroll MCP tool
 *
 * Calls the NannyKeeper API to run payroll for a household employee.
 * Creates a payroll record with full tax calculations and YTD tracking.
 */

const API_BASE = process.env.NANNYKEEPER_API_URL || "https://www.nannykeeper.com";

export async function executeRunPayroll(args: {
  employer_id: string;
  employee_id: string;
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  pay_frequency: string;
  regular_hours?: number;
  overtime_hours?: number;
  bonus?: number;
  other_earnings?: number;
  payment_method?: string;
  notes?: string;
  idempotency_key?: string;
}): Promise<string> {
  const apiKey = process.env.NANNYKEEPER_API_KEY;
  if (!apiKey) {
    return JSON.stringify({
      error:
        "NANNYKEEPER_API_KEY environment variable is not set. Get a key at nannykeeper.com/developers/keys",
    });
  }

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };

    if (args.idempotency_key) {
      headers["Idempotency-Key"] = args.idempotency_key;
    }

    const response = await fetch(`${API_BASE}/api/v1/payroll/run`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        employer_id: args.employer_id,
        pay_period_start: args.pay_period_start,
        pay_period_end: args.pay_period_end,
        pay_date: args.pay_date,
        pay_frequency: args.pay_frequency,
        employees: [
          {
            employee_id: args.employee_id,
            regular_hours: args.regular_hours,
            overtime_hours: args.overtime_hours,
            bonus: args.bonus,
            other_earnings: args.other_earnings,
            payment_method: args.payment_method || "check",
          },
        ],
        notes: args.notes,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 429) {
        return JSON.stringify({
          error: "Rate limit exceeded. Upgrade at nannykeeper.com/developers/pricing",
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
