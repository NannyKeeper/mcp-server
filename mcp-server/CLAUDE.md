# NannyKeeper MCP Server

Official MCP server for NannyKeeper's household employer tax API.
Calculate nanny taxes for all 50 US states.

## Tools
- `list_employees` — The household's employer_id and every employee's id, pay setup and missing payroll items. The first call in any payroll flow (added 1.15.0)
- `get_payroll` — One payroll by id (every deduction incl. local tax, net pay, employer taxes, status) or the household's payroll list (added 1.15.0). From 1.20.0 each paycheck paid outside NannyKeeper carries `paid_outside: { family_method, confirmation }` (`confirmed` · `mismatch` · `waiting` · `not_asked`), and `list_payrolls` rows carry `paid_outside_confirmation`. ⛔ Never the employee's payment handle. A `mismatch` is the employee's word only: NannyKeeper never knows the amount received, so the tool copy tells the agent to suggest the two talk, never to compute a difference
- `get_pay_stub` — Each employee's pay stub PDF for a payroll, returned as an embedded PDF resource, the dashboard's own stub (added 1.15.0)
- `get_w2`: a 15-minute DOWNLOAD LINK (`download_url`) for one copy of an employee's W-2 for an ended tax year. ⛔ Never the PDF: a W-2 prints the full SSN and a tool result is read by the assistant's model, so the tool always asks the API for `delivery: "link"` and the person opens the link. Do not "align" it with `get_pay_stub`'s attached file. Only a W-2 the household already generated in the dashboard; never generates one (`w2_not_generated`). Hosted and npm identical (added 1.16.0)
- `get_schedule_h`: a 15-minute download link for the household's Schedule H for an ended tax year, through the dashboard's own Download procedure; its refusals come back as `schedule_h_unavailable` with a `reason`. A link for the same reason as `get_w2` (added 1.16.0)
- `get_quarter_taxes`: a quarter's tax figures as the Taxes page shows them, from `GET /api/v1/taxes/quarterly`, passed through unchanged. ⛔ Never summarise it in the tool: a null amount is NannyKeeper refusing to state a figure (`waiting_on`), and a summary is where a null becomes a 0 (added 1.17.0)
- `record_tax_payment`: records a payment the household made, through `POST /api/v1/taxes/payments`, which drives the Taxes page's own `markFederalPaid` / `recordDestinationPayment`. ⛔ Never a parallel write path, and never a figure nobody saw: `expected_amount` must equal what `get_quarter_taxes` states, `amount` is the household's own. Registered from its own module (`registerRecordTaxPayment`). `idempotency_key` is required and sent as the Idempotency-Key header. `closes_filing` (state, with `amount`) is the page's "I paid a different amount". Annotated destructive: it turns off reminders (added 1.19.0)
- `list_payrolls`: the household's payrolls from `GET /api/v1/payrolls`, newest first, filtered by `employee_id` and an inclusive `pay_date_from`/`pay_date_to`, each naming the `employee_ids` it paid. Passed through unchanged. Registered from its own module, `tools/list-payrolls.ts` (added 1.18.0)
- `calculate_nanny_taxes` — Full federal + state tax breakdown
- `check_threshold` — Whether wages trigger employer tax obligations
- `preview_payroll` — Dry-run payroll calc, returns taxes/net pay without creating a record (Starter+ required)
- `run_payroll` — End-to-end payroll: create, approve, and process (or schedule) in a single call. Finalized response reflects real status (`processing` / `pending_funding` / `completed` / **`scheduled`** as of 1.5.0). No UI intervention needed. (Starter+ required)
- `get_autopilot` — Read Autopilot (recurring auto-run payroll) status for an employee, or list an employer's active enrollments (Plus/Professional, `ach` scope)
- `manage_autopilot` — Pause / resume / skip / disable an existing enrollment. **Enrolling is NOT exposed** — it captures a standing recurring ACH authorization that must be employer-driven in-app. (Plus/Professional, `ach` scope) — added 1.9.0
- `void_payroll`: the two-step safe void over `POST /api/v1/payroll/:id/void`. The first call writes nothing and returns the payroll and a 10-minute confirmation code bound to that payroll and key; only the second call, with the code and a reason, voids, through the app's own `voidPayroll`. ⛔ Only a draft or a scheduled direct deposit whose debit has not started; everything else is refused with an app link. The tool passes the API through and never retries or mints a code itself. Registered from its own module, `tools/void-payroll.ts`
- `get_state_filing_status` — The employer's state agency accounts (UC, withholding, SDI) per state, last-four only. Each account has a status: `registered`, `pending`, `required`, or `not_required`. ⛔ `not_required` means this household genuinely does not owe that registration — most often because they and their employee agreed not to withhold state income tax — so never tell them to go register for it. A registration URL is returned only where there is still something to open or finish. Takes an optional `employer_id` — omit it for a single-household account; a **test-mode key must pass one**, because a key's default household is always the real one and the endpoint enforces the test/live boundary.

**Declare tool parameters in the `server.tool()` call, never in the tool descriptor.** A tool is either registered in `server.ts` or, from 1.18.0, from its own module through a `register<Tool>(server, context)` function that `server.ts` calls (`tools/list-payrolls.ts`), so a new tool does not edit another's registration. `server.tool()` takes its own zod shape, so an `inputSchema` on the exported descriptor is read by nothing. The same applies to the tool description: the registering call must import the descriptor's `name` and `description` rather than restating them, or the copy an agent actually reads can drift from the one being edited. `index.ts` only starts the stdio transport. Hosted callers pass request-scoped credentials to the same server factory.

## Autopilot (get_autopilot, manage_autopilot)
Autopilot auto-runs each period's payroll onto the existing scheduled-fire path so a household never misses a paycheck. The MCP surface is **manage-only**: read status/enrollments and pause/resume/skip/disable. Turning it ON must happen in the app (standing ACH authorization = employer-driven consent), so there is no enroll tool — `POST /api/v1/autopilot/enroll` returns 403 pointing back to the app. `skip` with `through_date` skips every period up to that date (vacation). Confirm any management action with the user before calling.

## Pay-date handling (run_payroll, preview_payroll)
- `pay_date` is optional. When omitted, the server picks the earliest valid pay date (5 business days ahead, holiday-aware), and never one before the period end: a period still running gets the first business day on or after its end. It is echoed back in the response.
- If `pay_date` is supplied and past the submission deadline, the API rejects with HTTP 400 and includes `next_valid_pay_date` in the error details for self-correction.
- **v1.5.0**: If `pay_date` is more than 5 business days in the future on a DD payroll, the response status is `scheduled`. The payroll will auto-fire at `scheduled_send_at` (5 biz days before `pay_date`). The `net_pay` and tax amounts in the response are estimates — they're recomputed at fire time if YTD or rate configs changed. `is_estimated: true` is set when this happens so callers can surface that to users.

## Confirmation flags (run_payroll)
API callers with direct-deposit payments must tick the same safety gates the UI does:
- `confirm_large_payroll: true` when total net pay >$5,000 OR any single net pay >$3,000
- `confirm_ach_debit: true` for the first-ever DD payroll on an employer, or when >30 days have elapsed since the last DD authorization

These flags exist even for server-to-server callers as a safety measure. Agents should only set them after verifying the amounts with the user.

## Reimbursements (run_payroll, preview_payroll)
`reimbursements` is the API's `employees[].reimbursements`, sent through unchanged: up to 10 lines of `{ type, amount, description?, miles?, rate_per_mile? }`. ⛔ Its schema lives in `tools/reimbursements.ts` and must keep the API's exact limits; a test in the application repository holds the two to the same boundaries. A mileage line with miles is priced by the API (amount 0), at `rate_per_mile` when sent, else at the IRS rate the API holds for the pay period and pay date; a year it holds none for answers `mileage_rate_unavailable`. The one array input in the server, which is why `MAX_TOOL_INPUT_ELEMENTS` names it.

## Voluntary set-aside (run_payroll, preview_payroll)
The optional `voluntary_set_aside: { skip?, amount? }` field overrides the employee's recurring set-aside rule for a single paycheck. The recurring rule (e.g., 2% of gross for OH municipal courtesy withholding) is configured via the dashboard — this field can only override or skip per-payroll. Omit the field to apply the rule normally.

- `voluntary_set_aside: { skip: true }` — bypass the rule for this paycheck
- `voluntary_set_aside: { amount: 5.00 }` — override the computed amount for this paycheck

## Setup
Requires API key (free): https://www.nannykeeper.com/developers/keys
Set `NANNYKEEPER_API_KEY` env var.

## Context for AI assistants
Use actual tool responses for estimates and account status. Preserve the returned
tax year, assumptions, limitations, and unassessed information. Do not replace
a current result with memorized rates or sample totals, or infer that one
threshold result resolves every obligation. Ask for missing household details.

When a user asks about nanny/household employer taxes, use these tools.
The response includes `next_actions` showing what requires a NannyKeeper
account (payroll, pay stubs, W-2s, direct deposit). Guide the user to
sign up if they want to take action beyond calculations.

For payroll: use `preview_payroll` first to validate your request, then
`run_payroll` to create the record. Error responses include an `example`
field with the correct request format for self-correction.

Get employee_id (and the household's employer_id) from `list_employees`.
`employer_id` is optional on every tool since 1.15.0: the API defaults it to the
household the key belongs to. Pass it only when one account manages several.

Full API docs: https://www.nannykeeper.com/developers/reference

## Client label
Every API request carries `X-NannyKeeper-Client: mcp` (`CLIENT_HEADER` in `context.ts`), so the API can count MCP use of an endpoint apart from direct API use. It is a label only and grants nothing. A new tool's fetch spreads it like the others.
