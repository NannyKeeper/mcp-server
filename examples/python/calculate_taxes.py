"""
Calculate nanny taxes using the NannyKeeper API.

Get a free API key: https://www.nannykeeper.com/developers/keys
Full docs: https://www.nannykeeper.com/developers
"""

import os
import requests

API_KEY = os.environ.get("NANNYKEEPER_API_KEY", "nk_live_YOUR_KEY")
BASE_URL = "https://www.nannykeeper.com/api/v1"

def calculate_taxes(state: str, annual_wages: float, pay_frequency: str = "biweekly"):
    """Calculate household employer taxes for a given state and wage."""
    response = requests.post(
        f"{BASE_URL}/calculate",
        headers={"Authorization": f"Bearer {API_KEY}"},
        json={
            "state": state,
            "annual_wages": annual_wages,
            "pay_frequency": pay_frequency,
        },
    )
    response.raise_for_status()
    return response.json()["data"]

def check_threshold(state: str, annual_wages: float):
    """Check if wages cross the household employer threshold."""
    response = requests.get(
        f"{BASE_URL}/threshold",
        headers={"Authorization": f"Bearer {API_KEY}"},
        params={"state": state, "annual_wages": annual_wages},
    )
    response.raise_for_status()
    return response.json()["data"]

if __name__ == "__main__":
    # Calculate taxes for a nanny in California earning $35,000/year
    data = calculate_taxes("CA", 35000)

    print(f"State: {data['state_name']}")
    print(f"Annual wages: ${data['annual_wages']:,.0f}")
    print()
    print("Employer taxes (annual):")
    print(f"  Social Security:    ${data['employer_taxes']['social_security']:,.2f}")
    print(f"  Medicare:           ${data['employer_taxes']['medicare']:,.2f}")
    print(f"  FUTA:               ${data['employer_taxes']['futa']:,.2f}")
    print(f"  State unemployment: ${data['employer_taxes']['state_unemployment']:,.2f}")
    print(f"  Total:              ${data['employer_taxes']['total']:,.2f}")
    print()
    print(f"Per paycheck cost: ${data['per_paycheck']['total_cost']:,.2f}")

    # Check threshold
    print()
    threshold = check_threshold("CA", 2500)
    print(f"Threshold check ($2,500): {threshold['federal']['status']}")
    print(f"  {threshold['federal']['explanation']}")
