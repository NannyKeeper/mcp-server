/**
 * preview_payroll MCP tool
 *
 * Calls the NannyKeeper API to preview payroll without creating a record.
 * Returns full tax breakdown and net pay — use to validate before run_payroll.
 */

const API_BASE = process.env.NANNYKEEPER_API_URL || "https://www.nannykeeper.com";

export async function executePreviewPayroll(args: {
  employer_id: string;
  employee_id: string;
  pay_period_start: string;
  pay_period_end: string;
  pay_date?: string;
  pay_frequency: string;
  regular_hours?: number;
  overtime_hours?: number;
  bonus?: number;
  other_earnings?: number;
}): Promise<string> {
  const apiKey = process.env.NANNYKEEPER_API_KEY;
  if (!apiKey) {
    return JSON.stringify({
      error:
        "NANNYKEEPER_API_KEY environment variable is not set. Get a key at nannykeeper.com/developers/keys",
    });
  }

  try {
    const response = await fetch(`${API_BASE}/api/v1/payroll/preview`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        employer_id: args.employer_id,
        pay_period_start: args.pay_period_start,
        pay_period_end: args.pay_period_end,
        // Omit pay_date when unset so the API computes a default
        ...(args.pay_date ? { pay_date: args.pay_date } : {}),
        pay_frequency: args.pay_frequency,
        employees: [
          {
            employee_id: args.employee_id,
            regular_hours: args.regular_hours,
            overtime_hours: args.overtime_hours,
            bonus: args.bonus,
            other_earnings: args.other_earnings,
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      // Include example from error response if available (LLM self-correction)
      if (data.error?.example) {
        return JSON.stringify({
          error: data.error.message || `API error: ${response.status}`,
          validation_details: data.error.details,
          example_request: data.error.example,
          docs_url: data.error.docs_url,
        });
      }
      return JSON.stringify({
        error: data.error?.message || `API error: ${response.status}`,
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
