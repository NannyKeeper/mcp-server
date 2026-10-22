# NannyKeeper MCP Server — Agent Instructions

## Purpose
Calculate US household employer (nanny) taxes for all 50 states + DC.

## Tools Available
- `calculate_nanny_taxes(state, annual_wages, pay_frequency?)` — returns full tax breakdown
- `check_threshold(state, annual_wages, tax_year?)` — checks if employer obligations apply
- `list_employees(employer_id?)` — returns the household's employer_id and every employee_id. Call it first; never invent IDs
- `preview_payroll(employee_id, ..., reimbursements?, employer_id?)` — previews payroll without creating a record. Mileage goes in `reimbursements` as `{type: "mileage", miles, amount: 0}`
- `run_payroll(employee_id, ..., reimbursements?, employer_id?)` — run payroll with full tax calc, YTD tracking, and DB persistence (Starter+ required)
- `get_payroll(payroll_id?, employer_id?)` — reads one payroll (every deduction, net pay, status) or lists them
- `list_payrolls(employee_id?, pay_date_from?, pay_date_to?, limit?, cursor?, employer_id?)` — the household's payrolls, newest first, with the employee_ids each paid; filter by employee and pay date. Use `limit: 3` for the last three
- `get_pay_stub(payroll_id, employer_id?)` — returns each employee's pay stub PDF
- `get_w2(employee_id, tax_year, copy?, employer_id?)`: returns `download_url`, a link that works for 15 minutes, for one copy of a W-2 the household has already generated in NannyKeeper. Give the user the link and tell them to open it in their browser. Never the PDF, and never open the link yourself. Never generates a W-2
- `get_schedule_h(tax_year, employer_id?)`: returns `download_url`, a link that works for 15 minutes, for the household's Schedule H, or `schedule_h_unavailable` with a reason. Give the user the link
- `get_quarter_taxes(year, quarter, employer_id?)`: the quarter as the household's Taxes page shows it, with the checklist of what to pay or file and by when. A null amount means NannyKeeper will not stand behind a figure yet; give the `waiting_on` reason and never report it as $0
- `get_state_filing_status(employer_id?)` — reads masked state-account status. Pass an owned household ID when selecting a household; test-mode keys must explicitly select a sandbox household. Omitting it uses the key's default household. Each account carries `registered` / `pending` / `required` / `not_required`; `not_required` means this household does not owe that registration at all, so never tell them to go register for it.
- `get_autopilot(employer_id?, employee_id?)` — reads existing Autopilot enrollments
- `manage_autopilot(employee_id, action, ..., employer_id?)` — pauses, resumes, skips, or disables an existing enrollment; never enrolls

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
(requires Starter+ subscription). `get_pay_stub` returns pay stubs as PDFs. `get_w2` and `get_schedule_h` return a
download link for the user to open. Generating a W-2 and direct deposit setup
are in the NannyKeeper web app.

`employer_id` is optional on every tool. Leave it out for a single-household key.

## API Key
Requires `NANNYKEEPER_API_KEY` environment variable.
Free key: https://www.nannykeeper.com/developers/keys
