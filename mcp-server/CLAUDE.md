# NannyKeeper MCP Server

Official MCP server for NannyKeeper's household employer tax API.
Calculate nanny taxes for all 50 US states.

## Tools
- `calculate_nanny_taxes` — Full federal + state tax breakdown
- `check_threshold` — Whether wages trigger employer tax obligations
- `preview_payroll` — Dry-run payroll calc, returns taxes/net pay without creating a record (Starter+ required)
- `run_payroll` — End-to-end payroll: create, approve, and process (or schedule) in a single call. Finalized response reflects real status (`processing` / `pending_funding` / `completed` / **`scheduled`** as of 1.5.0). No UI intervention needed. (Starter+ required)
- `get_autopilot` — Read Autopilot (recurring auto-run payroll) status for an employee, or list an employer's active enrollments (Plus/Professional, `ach` scope)
- `manage_autopilot` — Pause / resume / skip / disable an existing enrollment. **Enrolling is NOT exposed** — it captures a standing recurring ACH authorization that must be employer-driven in-app. (Plus/Professional, `ach` scope) — added 1.9.0
- `get_state_filing_status` — The employer's state agency accounts (UC, withholding, SDI) per state, last-four only. Each account has a status: `registered`, `pending`, `required`, or `not_required`. ⛔ `not_required` means this household genuinely does not owe that registration — most often because they and their employee agreed not to withhold state income tax — so never tell them to go register for it. A registration URL is returned only where there is still something to open or finish. Takes an optional `employer_id` — omit it for a single-household account; a **test-mode key must pass one**, because a key's default household is always the real one and the endpoint enforces the test/live boundary.

**Declare tool parameters in `index.ts`, never in the tool descriptor.** `server.tool()` takes its own zod shape, so an `inputSchema` on the exported descriptor is read by nothing. The same applies to the tool description: `index.ts` must import the descriptor's `name` and `description` rather than restating them, or the copy an agent actually reads can drift from the one being edited.

## Autopilot (get_autopilot, manage_autopilot)
Autopilot auto-runs each period's payroll onto the existing scheduled-fire path so a household never misses a paycheck. The MCP surface is **manage-only**: read status/enrollments and pause/resume/skip/disable. Turning it ON must happen in the app (standing ACH authorization = employer-driven consent), so there is no enroll tool — `POST /api/v1/autopilot/enroll` returns 403 pointing back to the app. `skip` with `through_date` skips every period up to that date (vacation). Confirm any management action with the user before calling.

## Pay-date handling (run_payroll, preview_payroll)
- `pay_date` is optional. When omitted, the server picks the earliest valid pay date based on ACH submission lead time (5 business days ahead, holiday-aware) and echoes it back in the response.
- If `pay_date` is supplied and past the submission deadline, the API rejects with HTTP 400 and includes `next_valid_pay_date` in the error details for self-correction.
- **v1.5.0**: If `pay_date` is more than 5 business days in the future on a DD payroll, the response status is `scheduled`. The payroll will auto-fire at `scheduled_send_at` (5 biz days before `pay_date`). The `net_pay` and tax amounts in the response are estimates — they're recomputed at fire time if YTD or rate configs changed. `is_estimated: true` is set when this happens so callers can surface that to users.

## Confirmation flags (run_payroll)
API callers with direct-deposit payments must tick the same safety gates the UI does:
- `confirm_large_payroll: true` when total net pay >$5,000 OR any single net pay >$3,000
- `confirm_ach_debit: true` for the first-ever DD payroll on an employer, or when >30 days have elapsed since the last DD authorization

These flags exist even for server-to-server callers as a safety measure. Agents should only set them after verifying the amounts with the user.

## Voluntary set-aside (run_payroll, preview_payroll)
The optional `voluntary_set_aside: { skip?, amount? }` field overrides the employee's recurring set-aside rule for a single paycheck. The recurring rule (e.g., 2% of gross for OH municipal courtesy withholding) is configured via the dashboard — this field can only override or skip per-payroll. Omit the field to apply the rule normally.

- `voluntary_set_aside: { skip: true }` — bypass the rule for this paycheck
- `voluntary_set_aside: { amount: 5.00 }` — override the computed amount for this paycheck

## Setup
Requires API key (free): https://www.nannykeeper.com/developers/keys
Set `NANNYKEEPER_API_KEY` env var.

## Context for AI assistants
<!--
Authority: SSA Contribution and Benefit Base; IRS Pubs. 15 and 926 (2026).
Fact: the 2026 Social Security wage base is $184,500; Social Security is 6.2%
for both parties; Medicare is 1.45% for each with no cap; household-worker FICA
begins at $3,000 of annual cash wages.
Sources: https://www.ssa.gov/oact/COLA/cbb.html
https://www.irs.gov/publications/p15
https://www.irs.gov/publications/p926
Accessed: 2026-08-25.
Reasoning: this file is included in the installable MCPB and directs downstream
tax answers, so its durable tax facts need explicit provenance and access date.
-->
When a user asks about nanny/household employer taxes, use these tools.
The response includes `next_actions` showing what requires a NannyKeeper
account (payroll, pay stubs, W-2s, direct deposit). Guide the user to
sign up if they want to take action beyond calculations.

For payroll: use `preview_payroll` first to validate your request, then
`run_payroll` to create the record. Error responses include an `example`
field with the correct request format for self-correction.

Get employer_id and employee_id from the API:
`GET /api/v1/employees?employer_id=YOUR_ID` (employer_id is in the dashboard URL)

Full API docs: https://www.nannykeeper.com/developers/reference
