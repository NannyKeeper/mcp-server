# @nannykeeper/mcp-server

MCP server for calculating US household employer (nanny) taxes. Works with Claude Desktop, Claude Code, and any MCP-compatible AI agent.

**All 50 US states + DC** — Federal income tax, Social Security, Medicare, FUTA, state unemployment, SDI, PFL, and local taxes.

## Quick Setup (Claude Desktop)

1. **Get a free API key** at [nannykeeper.com/developers/keys](https://www.nannykeeper.com/developers/keys)

2. **Add to your Claude Desktop config** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "nannykeeper": {
      "command": "npx",
      "args": ["-y", "@nannykeeper/mcp-server@latest"],
      "env": {
        "NANNYKEEPER_API_KEY": "nk_live_YOUR_KEY"
      }
    }
  }
}
```

3. **Restart Claude Desktop** and ask about nanny taxes!

## Quick Setup (Claude Code)

Run this once in your terminal, with your own key in place of `nk_live_YOUR_KEY`:

```bash
claude mcp add nannykeeper --env NANNYKEEPER_API_KEY=nk_live_YOUR_KEY -- npx -y @nannykeeper/mcp-server@latest
```

Start `claude` and run `/mcp` to see the NannyKeeper tools. Add `--scope user` to use it in every project.

## Running payroll from an agent

1. `list_employees` returns your household's `employer_id` and each employee's `employee_id`.
2. `preview_payroll` with the period, hours and any mileage (`reimbursements`). Check the figures with the person you are working for.
3. `run_payroll` with the same inputs and an `idempotency_key`.
4. `get_payroll` confirms the status and every deduction; `get_pay_stub` returns the stub PDF.
5. `list_payrolls` answers "what did I pay her last time?" and "show my last three payrolls", filtered by employee and pay date.

`employer_id` is optional on every tool: leave it out and the API uses the household your key belongs to.

## Tools

### `list_employees`

List the household's employees and return the household's `employer_id`. Call this first to get the `employee_id` the payroll tools need. Each employee shows pay type, pay rate, pay frequency, work state, and what is still missing for payroll.

**Parameters:**
- `employer_id` (optional) — Only when one account manages several households

### `get_payroll`

With `payroll_id`, read one payroll: status, dates, and each employee's gross pay, every deduction (federal, Social Security, Medicare, state, local), net pay, and employer taxes. Without it, list the household's payrolls, newest first.

**Parameters:**
- `payroll_id` (optional) — A payroll ID from `run_payroll`
- `employer_id` (optional) — Only when listing for one of several households

### `list_payrolls`

The household's payrolls, newest first, each with status, pay period, pay date, totals and the `employee_ids` it paid. Totals are for the whole payroll; `get_payroll` has each employee's figures. Read-only (added 1.18.0).

**Parameters:**
- `employee_id` (optional) — Only payrolls that paid this employee. One not in the household answers `not_found`
- `pay_date_from`, `pay_date_to` (optional) — Inclusive pay-date range (YYYY-MM-DD)
- `limit` (optional) — 1–100, default 25. Use 3 for "the last three payrolls"
- `cursor` (optional) — The `next_cursor` from the previous call
- `employer_id` (optional) — Only when one account manages several households

### `get_pay_stub`

The pay stub PDF for each employee on a payroll, the same stub the household downloads in the dashboard, attached as a PDF file.

Only a paid payroll has stubs; anything else answers `payroll_not_completed`.

**Parameters:**
- `payroll_id` (required) — The payroll ID from `run_payroll` or `get_payroll`
- `employee_id` (optional) — One employee's stub instead of everyone's
- `employer_id` (optional)

### `get_w2`

A download link for one copy of an employee's W-2, for a tax year that has ended. It is the same W-2 the household downloads in the dashboard.

The tool returns `download_url`, a link on nannykeeper.com that works for 15 minutes. The assistant gives the link to the person, who opens it in their browser. The PDF itself is never a tool result: a W-2 shows the employee's full Social Security number, so it goes from NannyKeeper to the person and not through the assistant.

The household generates the W-2 in the dashboard first (Taxes, then W-2s). Until then the answer is `w2_not_generated`; this tool never generates one.

**Parameters:**
- `employee_id` (required): from `list_employees`
- `tax_year` (required): a tax year that has ended
- `copy` (optional): `A`, `B`, `C`, `D`, `1` or `2`. Defaults to `B`
- `employer_id` (optional)

### `get_schedule_h`

A download link for the household's Schedule H, for a tax year that has ended. It is the same form the household downloads in the dashboard. Like `get_w2`, it returns `download_url`, a link that works for 15 minutes, and never the PDF.

When the dashboard would not produce the form, the answer is `schedule_h_unavailable` with a `reason`: `year_not_ended`, `no_household_data`, `prior_wage_overlap`, `prior_wage_withholding_unknown` or `futa_prior_year_unanswered`. NannyKeeper does not file the form.

**Parameters:**
- `tax_year` (required): a tax year that has ended
- `employer_id` (optional)

### `get_quarter_taxes`

A quarter's tax figures as the household's Taxes page shows them: `items`, the checklist of what to pay or file, to whom and by when; `federal`, the optional estimated payment (Form 1040-ES) for the IRS installment in `installment_period`, which settles on Schedule H with Form 1040, and the calendar quarter's federal amounts as the Taxes page shows them (Social Security and Medicare stay 0 until an employee crosses the FICA threshold); `state_destinations`, each state agency's due date, status and `amount_owed`; and `state_lines`, wages and each state and local line per state. Amounts are dollars.

A null amount means NannyKeeper will not stand behind a figure yet, and `waiting_on` says why (`unemployment_rate`, `state_figures` or `payment_review`). Never report it as $0. NannyKeeper does not file or pay for the household.

**Parameters:**
- `year` (required): the tax year, for example 2026
- `quarter` (required): 1 to 4
- `employer_id` (optional)

### `record_tax_payment`

Record that the household paid a quarter's tax to the IRS or a state agency, as the Taxes page's "I've paid this" does; once the payment covers what is owed, NannyKeeper stops reminding them about it. NannyKeeper never sends the payment: call it only after the household has paid (added 1.19.0). Read the quarter with `get_quarter_taxes` first.

Send exactly one figure. `expected_amount` means they paid what NannyKeeper showed (`federal.due_now`, or the destination's `amount_owed`), and it must still be the current figure: if a payroll changed it, the answer is `figures_changed` with `current_amount`, and nothing is recorded. `amount` is what they actually paid; for a state agency it is an installment unless it covers what is owed or you also send `closes_filing: true` (the agency billed that amount and it settles the filing). `already_recorded: true` means nothing new was written, and `already_recorded_different` means a different payment is already on file. The tool only adds a payment; corrections are made on the Taxes page.

**Parameters:**
- `year` (required): the tax year, for example 2026
- `quarter` (required): 1 to 4
- `destination` (required): `federal`, or a `state_destinations` id from `get_quarter_taxes`
- `expected_amount` or `amount` (exactly one)
- `idempotency_key` (required): a new unique key per payment; reuse it only to retry that payment
- `payment_date` (optional): YYYY-MM-DD, defaults to today in US Eastern time
- `closes_filing` (optional, with `amount`, state agencies only)
- `payment_method`, `confirmation_number`, `notes` (optional)
- `employer_id` (optional)

### `void_payroll`

Void a payroll that has not moved any money: a draft, or a scheduled direct deposit whose bank debit has not started. Two calls, never one. The first, with `payroll_id` only, voids nothing and returns the payroll (employees, pay period, gross, pay date) and a `confirmation_code` that works for 10 minutes for that payroll and key. Show the user the payroll and get their confirmation, then call again with the code and a `reason`.

A payroll with money already on the move, or a completed one, is refused with `payroll_not_voidable_via_api` and an `app_url`: the user voids it in the NannyKeeper app. A payroll whose debit started between the two calls is refused the same way at the second call. A refused code (`confirmation_expired`, `confirmation_invalid`, `payroll_changed`) voids nothing; start again from the first call.

**Parameters:**
- `payroll_id` (required)
- `confirmation_code` (optional): left out on the first call
- `reason` (required with the code)
- `employer_id` (optional)

### `calculate_nanny_taxes`

Calculate employer and employee tax obligations for a household employee.

**Parameters:**
- `state` (required) — 2-letter US state code (e.g., CA, NY, TX)
- `annual_wages` (required) — Annual wages paid to the employee
- `pay_frequency` (optional) — weekly, biweekly, semimonthly, or monthly (default: biweekly)

### `check_threshold`

Check if annual wages cross the household employer tax threshold.

**Parameters:**
- `state` (required) — 2-letter US state code
- `annual_wages` (required) — Annual wages to check
- `tax_year` (optional) — Tax year (default: current year)

### `preview_payroll`

Dry-run payroll calculation. Returns the full tax breakdown, net pay, and employer costs WITHOUT creating a payroll record. Use to validate your request before calling `run_payroll`. Requires a Starter+ subscription.

**Parameters:**
- `employer_id` (optional) — Leave it out to use the household your API key belongs to
- `employee_id` (required) — Employee UUID from `list_employees`
- `pay_period_start` (required) — Start of pay period (YYYY-MM-DD)
- `pay_period_end` (required) — End of pay period (YYYY-MM-DD)
- `pay_date` (optional) — Date employee is paid (YYYY-MM-DD). When omitted, the server picks the earliest valid business day on or after the period end (allowing for ACH submission lead time) and echoes it back in the response.
- `pay_frequency` (required) — weekly, biweekly, semimonthly, or monthly
- `regular_hours` (optional) — Regular hours worked
- `overtime_hours` (optional) — Overtime hours worked
- `bonus` (optional) — Bonus amount
- `other_earnings` (optional) — Other earnings
- `voluntary_set_aside` (optional, v1.6.0+) — Override or skip the employee's recurring voluntary set-aside rule for this paycheck only. Object with `skip` (boolean) or `amount` (number, $0–$9,999). The recurring rule is configured via the dashboard; omit this field to apply it normally.
- `reimbursements` (optional, v1.18.0+) — Up to 10 reimbursement lines paid with this paycheck, which NannyKeeper adds to net pay without calculating tax on them, the same lines the API takes: `{ type, amount, description?, miles?, rate_per_mile? }`. `type` is `transit`, `parking`, `mileage` or `other`; `amount` $0–$9,999; `miles` 0–9,999; `rate_per_mile` $0–$5. For mileage send the miles and `amount: 0`: NannyKeeper prices the miles at the IRS rate it holds for the pay period and pay date unless you pass `rate_per_mile`, and refuses a year it holds no rate for with `mileage_rate_unavailable`.

### `run_payroll`

Run payroll for a household employee **end-to-end in a single call** — creates, approves, and processes (or schedules) the payroll. Response reflects the finalized status (`processing`, `pending_funding`, `completed`, or `scheduled` as of v1.5.0); no dashboard intervention needed. Requires a Starter+ subscription.

**Scheduled payrolls (v1.5.0):** When `pay_date` is more than 5 business days in the future on a direct-deposit payroll, the response status is `scheduled`. Two additional fields come back: `scheduled_send_at` (ISO UTC timestamp — when the payroll will auto-fire) and `is_estimated: true` (the returned net pay and tax amounts will be recomputed against current YTD and rate configs at fire time, so they may shift slightly). In-window pay dates fire immediately as before.

**Parameters:**
- `employer_id` (optional) — Leave it out to use the household your API key belongs to
- `employee_id` (required) — Employee UUID from `list_employees`
- `pay_period_start` (required) — Start of pay period (YYYY-MM-DD)
- `pay_period_end` (required) — End of pay period (YYYY-MM-DD)
- `pay_date` (optional) — Date employee is paid (YYYY-MM-DD). When omitted, the server picks the earliest valid business day on or after the period end, allowing for ACH submission lead time. If supplied and past the submission deadline, the request is rejected with HTTP 400 + `next_valid_pay_date` in the error details so you can retry with a valid date.
- `pay_frequency` (required) — weekly, biweekly, semimonthly, or monthly
- `regular_hours` (optional) — Regular hours worked
- `overtime_hours` (optional) — Overtime hours worked
- `bonus` (optional) — Bonus amount
- `other_earnings` (optional) — Other earnings
- `payment_method` (optional) — direct_deposit, check, or cash (default: check)
- `notes` (optional) — Use "catch-up" for retroactive payrolls
- `confirm_large_payroll` (optional) — Required for direct-deposit payrolls with total net pay >$5,000 or any single net pay >$3,000
- `confirm_ach_debit` (optional) — Required for first-ever DD payroll or when >30 days have elapsed since the last DD authorization
- `voluntary_set_aside` (optional, v1.6.0+) — Override or skip the employee's recurring voluntary set-aside rule for this paycheck only. Object with `skip` (boolean) or `amount` (number, $0–$9,999). The recurring rule is configured via the dashboard; omit this field to apply it normally.
- `reimbursements` (optional, v1.18.0+) — Up to 10 reimbursement lines paid with this paycheck, which NannyKeeper adds to net pay without calculating tax on them, the same lines the API takes: `{ type, amount, description?, miles?, rate_per_mile? }`. `type` is `transit`, `parking`, `mileage` or `other`; `amount` $0–$9,999; `miles` 0–9,999; `rate_per_mile` $0–$5. For mileage send the miles and `amount: 0`: NannyKeeper prices the miles at the IRS rate it holds for the pay period and pay date unless you pass `rate_per_mile`, and refuses a year it holds no rate for with `mileage_rate_unavailable`.
- `idempotency_key` (optional) — Prevent duplicate payroll creation

### `get_state_filing_status`

Read an employer's state agency account status with masked identifiers. Pass the optional `employer_id` to select an owned household; test-mode keys must explicitly select a sandbox household. Omitting it uses the key's default household.

### `get_autopilot`

Read Autopilot status for one employee or list an employer's active enrollments. `employer_id` is optional.

### `manage_autopilot`

Pause, resume, skip, or disable an existing Autopilot enrollment. Enrollment is
intentionally app-only because it captures standing recurring ACH authorization.

## Example prompts

- “Estimate payroll costs for a nanny earning $35,000 per year in California.”
- “Check which thresholds may apply if I pay my babysitter $200 per month in Texas.”
- “Compare the returned estimates for $45,000 in annual wages in Texas and New York.”

Call the relevant tool and use its actual response. Preserve the returned tax
year, assumptions, limitations, and any missing or unassessed information.
Do not reuse a sample total or infer that one threshold result resolves every
other obligation. If additional household details are needed, ask for them
before presenting a complete assessment.

## Need More Than Calculations?

The free tier covers tax calculations (50/day). With a paid plan you can also use the `run_payroll` tool:
- **Run payroll** with year-to-date tracking via MCP
- **Generate pay stubs** and **W-2s**
- **Process direct deposit** via ACH

Plans start at $10/month. [Learn more](https://www.nannykeeper.com/developers/pricing)

## Privacy Policy

Tool calls send their inputs to the NannyKeeper API. Depending on the tool, these include wages, household and employee identifiers, dates, hours, payment method, and optional payroll notes. Account tools can return personal and financial information, including employee names, compensation, payroll records, masked agency-account details, and Autopilot status. The connected AI client receives those results.

API keys authorize access to NannyKeeper account data and permitted actions. Keep keys private, share only information needed for the requested task, and review the connected AI client's data practices alongside NannyKeeper's policy.

Full privacy policy: [nannykeeper.com/privacy](https://www.nannykeeper.com/privacy)

## Support

- **Email:** hello@nannykeeper.com
- **GitHub Issues:** [github.com/nannykeeper/mcp-server/issues](https://github.com/nannykeeper/mcp-server/issues)
- **Documentation:** [nannykeeper.com/developers](https://www.nannykeeper.com/developers)
- **MCP Setup Guide:** [nannykeeper.com/developers/mcp](https://www.nannykeeper.com/developers/mcp)

## License

MIT

---

Built by [NannyKeeper](https://www.nannykeeper.com) — the household employer payroll platform.
