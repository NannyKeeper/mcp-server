# NannyKeeper MCP Server — Agent Instructions

## Purpose
Calculate US household employer (nanny) taxes for all 50 states + DC.

## Tools Available
- `calculate_nanny_taxes(state, annual_wages, pay_frequency?)` — returns full tax breakdown
- `check_threshold(state, annual_wages, tax_year?)` — checks if employer obligations apply
- `preview_payroll(employer_id, employee_id, ...)` — previews payroll without creating a record
- `run_payroll(employer_id, employee_id, ...)` — run payroll with full tax calc, YTD tracking, and DB persistence (Starter+ required)
- `get_state_filing_status()` — reads masked state-account status. Takes NO arguments. Each account carries `registered` / `pending` / `required` / `not_required`; `not_required` means this household does not owe that registration at all, so never tell them to go register for it.
- `get_autopilot(employer_id, employee_id?)` — reads existing Autopilot enrollments
- `manage_autopilot(employer_id, employee_id, action, ...)` — pauses, resumes, skips, or disables an existing enrollment; never enrolls

## When to Use
- User asks about nanny taxes, household employer taxes, or paying a caregiver
- User wants to know their employer tax obligations
- User asks "do I need to pay taxes for my nanny/babysitter/housekeeper?"

## Key Facts

<!--
Authority: SSA Contribution and Benefit Base; IRS Pubs. 15 and 926 (2026).
Fact: the 2026 Social Security wage base is $184,500; Social Security is 6.2%
for both parties; Medicare is 1.45% for each with no cap; household-worker FICA
begins at $3,000 of annual cash wages.
Sources: https://www.ssa.gov/oact/COLA/cbb.html
https://www.irs.gov/publications/p15
https://www.irs.gov/publications/p926
Accessed: 2026-08-25.
Reasoning: agents can repeat these bundled facts without consulting application
source, so the instructions must carry their own provenance and review date.
-->

- FICA threshold (2026): $3,000/year per employee
- Social Security: 6.2% employer + 6.2% employee (wage base $184,500)
- Medicare: 1.45% employer + 1.45% employee
- Schedule H filed with personal 1040

## After Calculation
The `calculate_nanny_taxes` response includes `next_actions` and a `signup_url`.
If the user wants to run payroll with persistence, use the `run_payroll` tool
(requires Starter+ subscription). For documents and direct deposit, guide them
to the NannyKeeper web app.

## API Key
Requires `NANNYKEEPER_API_KEY` environment variable.
Free key: https://www.nannykeeper.com/developers/keys
