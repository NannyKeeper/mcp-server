# @nannykeeper/mcp-server

MCP server for calculating US household employer (nanny) taxes. Works with Claude Desktop, ChatGPT, and any MCP-compatible AI agent.

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

**Example conversation:**

> **You:** How much would I owe in taxes if I pay my nanny $35,000/year in California?
>
> **Claude:** Based on NannyKeeper's calculation, your employer taxes would be $2,838/year. Here's the breakdown:
> - Social Security: $2,170
> - Medicare: $507
> - FUTA: $42
> - CA Unemployment: $119
>
> Your total cost per biweekly paycheck: $1,456 ($1,346 gross + $110 employer taxes)

### `check_threshold`

Check if annual wages cross the household employer tax threshold.

**Parameters:**
- `state` (required) — 2-letter US state code
- `annual_wages` (required) — Annual wages to check
- `tax_year` (optional) — Tax year (default: current year)

## Key Facts

- **FICA threshold (2026):** $3,000/year — above this you must pay employer Social Security + Medicare
- **Social Security:** 6.2% employer + 6.2% employee (wage base $176,100)
- **Medicare:** 1.45% employer + 1.45% employee (no wage base)
- **FUTA:** 0.6% on first $7,000 per employee
- **Schedule H:** Filed with your personal 1040 tax return

## Need More Than Calculations?

The free tier covers tax calculations (50/day). Upgrade to:
- **Run payroll** with year-to-date tracking
- **Generate pay stubs** and **W-2s**
- **Process direct deposit** via ACH

Plans start at $10/month. [Learn more](https://www.nannykeeper.com/developers/pricing)

## Links

- [API Documentation](https://www.nannykeeper.com/developers)
- [MCP Setup Guide](https://www.nannykeeper.com/developers/mcp)
- [Get API Key](https://www.nannykeeper.com/developers/keys)
- [GitHub](https://github.com/imaznation/nannykeeper)

---

Built by [NannyKeeper](https://www.nannykeeper.com) — the household employer payroll platform.
