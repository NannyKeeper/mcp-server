# NannyKeeper MCP Server — Agent Instructions

## Purpose
Calculate US household employer (nanny) taxes for all 50 states + DC.

## Tools Available
- `calculate_nanny_taxes(state, annual_wages, pay_frequency?)` — returns full tax breakdown
- `check_threshold(state, annual_wages, tax_year?)` — checks if employer obligations apply
- `preview_payroll(employer_id, employee_id, ...)` — previews payroll without creating a record
- `run_payroll(employer_id, employee_id, ...)` — run payroll with full tax calc, YTD tracking, and DB persistence (Starter+ required)
- `get_state_filing_status(employer_id?)` — reads masked state-account status. Pass an owned household ID when selecting a household; test-mode keys must explicitly select a sandbox household. Omitting it uses the key's default household. Each account carries `registered` / `pending` / `required` / `not_required`; `not_required` means this household does not owe that registration at all, so never tell them to go register for it.
- `get_autopilot(employer_id, employee_id?)` — reads existing Autopilot enrollments
- `manage_autopilot(employer_id, employee_id, action, ...)` — pauses, resumes, skips, or disables an existing enrollment; never enrolls

## When to Use
- User asks about nanny taxes, household employer taxes, or paying a caregiver
- User wants to know their employer tax obligations
- User asks "do I need to pay taxes for my nanny/babysitter/housekeeper?"

## Use returned results

Use the tools' actual responses for estimates and account status. Preserve the
returned tax year, assumptions, limitations, and any unassessed information.
Do not substitute memorized rates or sample totals for a current tool result,
and do not treat one threshold result as a complete assessment of every
obligation. Ask for missing household details when needed.

## After Calculation
The `calculate_nanny_taxes` response includes `next_actions` and a `signup_url`.
If the user wants to run payroll with persistence, use the `run_payroll` tool
(requires Starter+ subscription). For documents and direct deposit, guide them
to the NannyKeeper web app.

## API Key
Requires `NANNYKEEPER_API_KEY` environment variable.
Free key: https://www.nannykeeper.com/developers/keys
