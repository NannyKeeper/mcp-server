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
      "args": ["@nannykeeper/mcp-server"],
      "env": {
        "NANNYKEEPER_API_KEY": "nk_live_YOUR_KEY"
      }
    }
  }
}
```

3. **Restart Claude Desktop** and ask about nanny taxes!

## Tools

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
- `employer_id` (required) — Employer UUID from your NannyKeeper account
- `employee_id` (required) — Employee UUID
- `pay_period_start` (required) — Start of pay period (YYYY-MM-DD)
- `pay_period_end` (required) — End of pay period (YYYY-MM-DD)
- `pay_date` (optional) — Date employee is paid (YYYY-MM-DD). When omitted, the server picks the earliest valid pay date based on ACH submission lead time and echoes it back in the response.
- `pay_frequency` (required) — weekly, biweekly, semimonthly, or monthly
- `regular_hours` (optional) — Regular hours worked
- `overtime_hours` (optional) — Overtime hours worked
- `bonus` (optional) — Bonus amount
- `other_earnings` (optional) — Other earnings
- `voluntary_set_aside` (optional, v1.6.0+) — Override or skip the employee's recurring voluntary set-aside rule for this paycheck only. Object with `skip` (boolean) or `amount` (number, $0–$9,999). The recurring rule is configured via the dashboard; omit this field to apply it normally.

### `run_payroll`

Run payroll for a household employee **end-to-end in a single call** — creates, approves, and processes (or schedules) the payroll. Response reflects the finalized status (`processing`, `pending_funding`, `completed`, or `scheduled` as of v1.5.0); no dashboard intervention needed. Requires a Starter+ subscription.

**Scheduled payrolls (v1.5.0):** When `pay_date` is more than 5 business days in the future on a direct-deposit payroll, the response status is `scheduled`. Two additional fields come back: `scheduled_send_at` (ISO UTC timestamp — when the payroll will auto-fire) and `is_estimated: true` (the returned net pay and tax amounts will be recomputed against current YTD and rate configs at fire time, so they may shift slightly). In-window pay dates fire immediately as before.

**Parameters:**
- `employer_id` (required) — Employer UUID from your NannyKeeper account
- `employee_id` (required) — Employee UUID to run payroll for
- `pay_period_start` (required) — Start of pay period (YYYY-MM-DD)
- `pay_period_end` (required) — End of pay period (YYYY-MM-DD)
- `pay_date` (optional) — Date employee is paid (YYYY-MM-DD). When omitted, the server picks the earliest valid pay date from today + ACH submission lead time. If supplied and past the submission deadline, the request is rejected with HTTP 400 + `next_valid_pay_date` in the error details so you can retry with a valid date.
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
- `idempotency_key` (optional) — Prevent duplicate payroll creation

### `get_state_filing_status`

Read an employer's state agency account status with masked identifiers. Pass the optional `employer_id` to select an owned household; test-mode keys must explicitly select a sandbox household. Omitting it uses the key's default household.

### `get_autopilot`

Read Autopilot status for one employee or list an employer's active enrollments.

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
