/** Public listing copy avoids pricing prompts and delegates tax facts to the API. */
export const publicDescriptions: Record<string, string> = {
  calculate_nanny_taxes: "Estimate household payroll taxes using the NannyKeeper calculator. Provide work state, annual wages, and pay frequency; include residence state when different. These estimates do not incorporate an existing employee's year-to-date payroll. Use preview_payroll for an existing employee. The calculator has no family-relationship input, so its taxes assume no family exemption applies. threshold.action_required is true or null, never false; present null as not determined. Preserve any limitations or unassessed items returned by the API.",
  check_threshold: "Check the supported annual wage threshold assessment for one household employee. This tool has no household-wide quarterly wages or family-relationship input. federal.action_required is true or null, never false; present null as not determined. Preserve the API's limitations and unassessed items; do not present its result as a complete determination of obligations.",
  preview_payroll: "Preview payroll for an existing household employee without creating a payroll record. Review the returned pay date, gross and net pay, employer costs, warnings, and any estimated status with the user before running payroll. The account must already have access to payroll. Get employee IDs from list_employees; never invent them.",
  run_payroll: "Create, approve, and process payroll for an existing household employee. Check and cash record payments the employer handles themselves. Direct deposit initiates or schedules NannyKeeper processing through Stripe. First preview the same inputs and obtain explicit confirmation of the employee, period, pay date, amounts, and payment method. Set debit or large-payroll confirmation flags only after the user explicitly authorizes the corresponding action. Use one idempotency_key per approved payroll and reuse it on a retry with identical inputs. Do not retry a rejected payroll with changed dates, payment method, confirmation flags, or off_cycle to bypass a safeguard. Report the exact returned status; scheduled or processing does not mean paid.",
  get_state_filing_status: "Read masked state agency account status for the connected household. Use employer_id to select an authorized household when needed. Present returned registered, pending, required, and not_required states faithfully. This tool does not register an account or submit a filing. Do not infer that missing or unassessed information means no obligation.",
  list_employees: "List the connected household's employees with their pay setup and what is still missing for payroll. Returns the employee IDs the payroll tools need. Read-only.",
  get_payroll: "Read one payroll by ID, or list the household's payrolls. Returns status, dates, gross pay, each deduction, net pay, and employer taxes. Report the exact status; scheduled or processing does not mean paid.",
  get_pay_stub: "Get the pay stub PDF for each employee on a paid payroll, the same stub the household downloads in NannyKeeper. A payroll that is not paid yet answers payroll_not_completed. Safe to repeat.",
  get_autopilot: "Read existing recurring payroll enrollment status for a household, optionally for one employee. Returns status and available schedule information; it does not enroll anyone or change payroll.",
  manage_autopilot: "Pause, resume, skip, or disable an existing recurring payroll enrollment. Confirm the employee and exact action before calling. Resume can restart future payroll generation and Stripe processing. Pausing does not cancel a payroll that is already scheduled. To cancel an existing payroll, use NannyKeeper. Initial enrollment and its standing authorization happen in NannyKeeper.",
};

export function toolResult(text: string, publicConnection = false) {
  let data: unknown;
  try { data = JSON.parse(text); } catch { data = null; }
  const isError = !!data && typeof data === "object" && "error" in data;
  if (publicConnection && data && typeof data === "object") {
    // API acquisition prompts are useful in the standalone developer package,
    // but public plugins provide access to existing accounts without selling plans.
    text = JSON.stringify(data, (key, value: unknown) =>
      ["signup_url", "upgrade_url", "continue_url", "next_actions"].includes(key) ? undefined : value);
  }
  return { content: [{ type: "text" as const, text }], ...(isError ? { isError: true } : {}) };
}
