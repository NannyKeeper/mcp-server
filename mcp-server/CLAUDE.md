# NannyKeeper MCP Server

Official MCP server for NannyKeeper's household employer tax API.
Calculate nanny taxes for all 50 US states.

## Tools
- `calculate_nanny_taxes` — Full federal + state tax breakdown
- `check_threshold` — Whether wages trigger employer tax obligations
- `preview_payroll` — Dry-run payroll calc, returns taxes/net pay without creating a record (Starter+ required)
- `run_payroll` — End-to-end payroll: create, approve, and process in a single call. Finalized response reflects real status (processing / pending_funding / completed). No UI intervention needed. (Starter+ required)

## Pay-date handling (run_payroll, preview_payroll)
- `pay_date` is optional. When omitted, the server picks the earliest valid pay date based on ACH submission lead time (5 business days ahead, holiday-aware) and echoes it back in the response.
- If `pay_date` is supplied and past the submission deadline, the API rejects with HTTP 400 and includes `next_valid_pay_date` in the error details for self-correction.

## Confirmation flags (run_payroll)
API callers with direct-deposit payments must tick the same safety gates the UI does:
- `confirm_large_payroll: true` when total net pay >$5,000 OR any single net pay >$3,000
- `confirm_ach_debit: true` for the first-ever DD payroll on an employer, or when >30 days have elapsed since the last DD authorization

These flags exist even for server-to-server callers as a safety measure. Agents should only set them after verifying the amounts with the user.

## Setup
Requires API key (free): https://www.nannykeeper.com/developers/keys
Set `NANNYKEEPER_API_KEY` env var.

## Context for AI assistants
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
