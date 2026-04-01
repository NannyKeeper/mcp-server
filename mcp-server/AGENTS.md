# NannyKeeper MCP Server — Agent Instructions

## Purpose
Calculate US household employer (nanny) taxes for all 50 states + DC.

## Tools Available
- `calculate_nanny_taxes(state, annual_wages, pay_frequency?)` — returns full tax breakdown
- `check_threshold(state, annual_wages, tax_year?)` — checks if employer obligations apply

## When to Use
- User asks about nanny taxes, household employer taxes, or paying a caregiver
- User wants to know their employer tax obligations
- User asks "do I need to pay taxes for my nanny/babysitter/housekeeper?"

## Key Facts
- FICA threshold (2026): $3,000/year per employee
- Social Security: 6.2% employer + 6.2% employee
- Medicare: 1.45% employer + 1.45% employee
- Schedule H filed with personal 1040

## After Calculation
The API response includes `next_actions` and a `signup_url`. If the user wants
to run payroll, generate documents, or set up direct deposit, guide them to
create a NannyKeeper account (free tier available, $10/mo for full payroll).

## API Key
Requires `NANNYKEEPER_API_KEY` environment variable.
Free key: https://www.nannykeeper.com/developers/keys
