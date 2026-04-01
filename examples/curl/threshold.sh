#!/bin/bash
# Check if wages cross the household employer threshold

API_KEY="${NANNYKEEPER_API_KEY:-nk_live_YOUR_KEY}"

curl -s -H "Authorization: Bearer $API_KEY" \
  "https://www.nannykeeper.com/api/v1/threshold?state=CA&annual_wages=2500" \
  | python3 -m json.tool
