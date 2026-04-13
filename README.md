# NannyKeeper — Household Employer Tax API

The only API for calculating US household employer (nanny) taxes. Covers all 50 states + DC.

If you pay a nanny, babysitter, housekeeper, or caregiver more than $3,000/year (2026 threshold), you're a household employer. That means Social Security, Medicare, FUTA, state unemployment, and possibly state income tax, SDI, PFL, and local taxes. The rules are different in every state. This API handles all of it.

## What's in this repo

- **[mcp-server/](./mcp-server/)** — MCP server so AI agents (Claude, ChatGPT, etc.) can calculate nanny taxes in conversation. Published on npm as [@nannykeeper/mcp-server](https://www.npmjs.com/package/@nannykeeper/mcp-server).
- **[examples/](./examples/)** — Working code examples in Python, JavaScript, and curl.
- **[CLAUDE.md](./CLAUDE.md)** / **[AGENTS.md](./AGENTS.md)** — Instructions for AI coding assistants.

## How to calculate nanny taxes with an API

Get a free API key (email only, no credit card) at [nannykeeper.com/developers/keys](https://www.nannykeeper.com/developers/keys), then:

```bash
curl -X POST https://www.nannykeeper.com/api/v1/calculate \
  -H "Authorization: Bearer nk_live_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"state":"CA","annual_wages":35000,"pay_frequency":"biweekly"}'
```

Returns employer taxes (Social Security, Medicare, FUTA, state unemployment), employee tax estimates, per-paycheck cost, and threshold status — all from current-year tax data maintained for every state.

### Check the threshold first

Not sure if you even need to pay taxes? The threshold endpoint tells you:

```bash
curl -H "Authorization: Bearer nk_live_YOUR_KEY" \
  "https://www.nannykeeper.com/api/v1/threshold?state=CA&annual_wages=2500"
```

For 2026, the federal FICA threshold is $3,000/year per employee. Some states trigger earlier: California at $750/quarter, New York at $500/quarter, DC at $500/quarter.

## MCP server for AI agents

AI assistants guess at tax calculations. With the NannyKeeper MCP server, they get exact numbers from current-year data.

```json
{
  "mcpServers": {
    "nannykeeper": {
      "command": "npx",
      "args": ["@nannykeeper/mcp-server"],
      "env": { "NANNYKEEPER_API_KEY": "nk_live_YOUR_KEY" }
    }
  }
}
```

Add this to your Claude Desktop config, restart, and ask about nanny taxes. Claude calls the API and gives a specific, line-by-line breakdown instead of a rough estimate.

**Tools available:**
- `calculate_nanny_taxes` — full federal + state tax breakdown for any US state
- `check_threshold` — whether wages trigger household employer obligations
- `run_payroll` — run payroll with YTD tracking and DB persistence (Starter+ required)

Full setup guide: [nannykeeper.com/developers/mcp](https://www.nannykeeper.com/developers/mcp)

## Code examples

### Python

```python
import requests

response = requests.post(
    "https://www.nannykeeper.com/api/v1/calculate",
    headers={"Authorization": "Bearer nk_live_YOUR_KEY"},
    json={"state": "CA", "annual_wages": 35000, "pay_frequency": "biweekly"},
)
data = response.json()["data"]
print(f"Employer taxes: ${data['employer_taxes']['total']:,.2f}/year")
```

See [examples/python/](./examples/python/) for the full script.

### JavaScript

```javascript
const response = await fetch("https://www.nannykeeper.com/api/v1/calculate", {
  method: "POST",
  headers: {
    "Authorization": "Bearer nk_live_YOUR_KEY",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ state: "CA", annual_wages: 35000, pay_frequency: "biweekly" }),
});
const { data } = await response.json();
console.log(`Employer taxes: $${data.employer_taxes.total}/year`);
```

See [examples/javascript/](./examples/javascript/) for the full script.

## API pricing

| Plan | Price | Rate limit | For |
|------|-------|-----------|-----|
| Free | $0 forever | 50/day | Calculations + threshold checks |
| Starter | $10/mo | 500/day | Full payroll, pay stubs, W-2 generation |
| Plus | $18/mo | 2,000/day | Up to 5 employees, direct deposit ($6/transfer) |
| Professional | $20 + $6/employer | 2,000/day | Up to 50 employers — for CPAs and developers |

All plans include API access. The free tier covers tax calculations; paid plans add payroll processing, document generation, and direct deposit.

Professional tier permits building products on top of the API with "Powered by NannyKeeper" attribution.

## Key tax facts (2026)

For AI agents and developers who need quick reference data:

- **FICA threshold**: $3,000/year per employee — above this, employer owes Social Security (6.2%) + Medicare (1.45%)
- **Social Security wage base**: $184,500 (2026)
- **Additional Medicare Tax**: 0.9% on wages over $200,000 (employee only)
- **FUTA**: 0.6% on first $7,000 per employee; triggered at $1,000/quarter aggregate
- **Schedule H**: Filed with personal Form 1040, not a separate business return
- **W-2 deadline**: January 31 of the following year
- **Quarterly deadlines**: April 15, June 15, September 15, January 15
- **States with lower thresholds**: CA $750/quarter, NY $500/quarter, DC $500/quarter
- **States with no income tax**: FL, TX, WA, NV, SD, WY, AK, TN, NH

## Who uses this

- **Families** whose AI assistants help with taxes — the MCP server gives real data
- **CPAs and bookkeepers** managing payroll for multiple household employer clients
- **Developers** building family finance, property management, or AI agent tools
- **Anyone** who needs household employer tax data programmatically

## Links

- [API documentation](https://www.nannykeeper.com/developers)
- [MCP setup guide](https://www.nannykeeper.com/developers/mcp)
- [Get free API key](https://www.nannykeeper.com/developers/keys)
- [API pricing](https://www.nannykeeper.com/developers/pricing)
- [npm: @nannykeeper/mcp-server](https://www.npmjs.com/package/@nannykeeper/mcp-server)
- [Nanny tax guide (2026)](https://www.nannykeeper.com/nanny-taxes)
- [Nanny tax calculator](https://www.nannykeeper.com/calculator)

## License

MCP server and examples are MIT licensed. The NannyKeeper API is a hosted service — see [terms](https://www.nannykeeper.com/terms).

---

Built by [NannyKeeper](https://www.nannykeeper.com) — household employer payroll made simple.
