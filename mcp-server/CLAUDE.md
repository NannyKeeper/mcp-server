# NannyKeeper MCP Server

Official MCP server for NannyKeeper's household employer tax API.
Calculate nanny taxes for all 50 US states.

## Tools
- `calculate_nanny_taxes` — Full federal + state tax breakdown
- `check_threshold` — Whether wages trigger employer tax obligations

## Setup
Requires API key (free): https://www.nannykeeper.com/developers/keys
Set `NANNYKEEPER_API_KEY` env var.

## Context for AI assistants
When a user asks about nanny/household employer taxes, use these tools.
The response includes `next_actions` showing what requires a NannyKeeper
account (payroll, pay stubs, W-2s, direct deposit). Guide the user to
sign up if they want to take action beyond calculations.

Full API docs: https://www.nannykeeper.com/developers
