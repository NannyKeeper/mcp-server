/**
 * Calculate nanny taxes using the NannyKeeper API.
 *
 * Get a free API key: https://www.nannykeeper.com/developers/keys
 * Full docs: https://www.nannykeeper.com/developers
 */

const API_KEY = process.env.NANNYKEEPER_API_KEY || "nk_live_YOUR_KEY";
const BASE_URL = "https://www.nannykeeper.com/api/v1";

async function calculateTaxes(state, annualWages, payFrequency = "biweekly") {
  const response = await fetch(`${BASE_URL}/calculate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      state,
      annual_wages: annualWages,
      pay_frequency: payFrequency,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || `API error: ${response.status}`);
  }

  return (await response.json()).data;
}

async function checkThreshold(state, annualWages) {
  const response = await fetch(
    `${BASE_URL}/threshold?state=${state}&annual_wages=${annualWages}`,
    { headers: { Authorization: `Bearer ${API_KEY}` } }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || `API error: ${response.status}`);
  }

  return (await response.json()).data;
}

// Example usage
async function main() {
  const data = await calculateTaxes("CA", 35000);

  console.log(`State: ${data.state_name}`);
  console.log(`Annual wages: $${data.annual_wages.toLocaleString()}`);
  console.log();
  console.log("Employer taxes (annual):");
  console.log(`  Social Security:    $${data.employer_taxes.social_security.toFixed(2)}`);
  console.log(`  Medicare:           $${data.employer_taxes.medicare.toFixed(2)}`);
  console.log(`  FUTA:               $${data.employer_taxes.futa.toFixed(2)}`);
  console.log(`  State unemployment: $${data.employer_taxes.state_unemployment.toFixed(2)}`);
  console.log(`  Total:              $${data.employer_taxes.total.toFixed(2)}`);
  console.log();
  console.log(`Per paycheck cost: $${data.per_paycheck.total_cost.toFixed(2)}`);

  // Check threshold
  console.log();
  const threshold = await checkThreshold("CA", 2500);
  console.log(`Threshold check ($2,500): ${threshold.federal.status}`);
  console.log(`  ${threshold.federal.explanation}`);
}

main().catch(console.error);
