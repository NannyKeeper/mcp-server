#!/bin/bash
# Calculate nanny taxes for California, $35,000/year, biweekly

API_KEY="${NANNYKEEPER_API_KEY:-nk_live_YOUR_KEY}"

curl -s -X POST https://www.nannykeeper.com/api/v1/calculate \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "state": "CA",
    "annual_wages": 35000,
    "pay_frequency": "biweekly"
  }' | python3 -m json.tool
