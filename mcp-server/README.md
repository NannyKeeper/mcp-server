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

## Examples

### Example 1: Full tax calculation

> **You:** How much would I owe in taxes if I pay my nanny $35,000/year in California?
>
> **Claude** uses `calculate_nanny_taxes` with `state: "CA"`, `annual_wages: 35000`
>
> **Claude:** Based on NannyKeeper's calculation, here's your tax breakdown for paying a nanny $35,000/year in California:
>
> **Employer taxes (you pay):** $2,838/year
> - Social Security (6.2%): $2,170
> - Medicare (1.45%): $507.50
> - FUTA (0.6%): $42
> - CA Unemployment (SDI/ETT): $119
>
> **Per biweekly paycheck:** Your total cost is $1,456 ($1,346 gross pay + $110 employer taxes).
>
> The employee also pays $2,678 in their share of FICA, withheld from each paycheck.

### Example 2: Threshold check

> **You:** I pay my babysitter $200/month. Do I need to worry about nanny taxes?
>
> **Claude** uses `check_threshold` with `state: "TX"`, `annual_wages: 2400`
>
> **Claude:** At $2,400/year, you're below the federal household employer threshold of $3,000 (for 2026). You don't need to pay Social Security or Medicare taxes, and you don't need to file Schedule H. If your babysitter's wages stay under $3,000 for the year, no action is needed.

### Example 3: Comparing costs across states

> **You:** I'm relocating from Texas to New York. How will that change what I owe for my nanny who makes $45,000?
>
> **Claude** uses `calculate_nanny_taxes` for both TX and NY with `annual_wages: 45000`
>
> **Claude:** Moving from Texas to New York will increase your employer tax costs:
>
> | | Texas | New York |
> |---|---|---|
> | Social Security | $2,790 | $2,790 |
> | Medicare | $652.50 | $652.50 |
> | FUTA | $42 | $42 |
> | State Unemployment | $0 | $133.65 |
> | **Total employer taxes** | **$3,485** | **$3,618** |
>
> The difference is $133/year — New York has a state unemployment insurance (SUI) tax that Texas doesn't. Your nanny will also see New York state income tax withheld from their paychecks.

## Key Facts

- **FICA threshold (2026):** $3,000/year — above this you must pay employer Social Security + Medicare
- **Social Security:** 6.2% employer + 6.2% employee (wage base $184,500)
- **Medicare:** 1.45% employer + 1.45% employee (no wage base)
- **FUTA:** 0.6% on first $7,000 per employee
- **Schedule H:** Filed with your personal 1040 tax return

## Need More Than Calculations?

The free tier covers tax calculations (50/day). With a paid plan you can also use the `run_payroll` tool:
- **Run payroll** with year-to-date tracking via MCP
- **Generate pay stubs** and **W-2s**
- **Process direct deposit** via ACH

Plans start at $10/month. [Learn more](https://www.nannykeeper.com/developers/pricing)

## Privacy Policy

This MCP server sends wage calculation requests (state, annual wages, pay frequency) to the NannyKeeper API. No personally identifiable information is collected or transmitted. API keys are used for authentication and rate limiting only.

Full privacy policy: [nannykeeper.com/privacy](https://www.nannykeeper.com/privacy)

## Support

- **Email:** hello@nannykeeper.com
- **GitHub Issues:** [github.com/imaznation/nannykeeper/issues](https://github.com/imaznation/nannykeeper/issues)
- **Documentation:** [nannykeeper.com/developers](https://www.nannykeeper.com/developers)
- **MCP Setup Guide:** [nannykeeper.com/developers/mcp](https://www.nannykeeper.com/developers/mcp)

## License

MIT

---

Built by [NannyKeeper](https://www.nannykeeper.com) — the household employer payroll platform.
