/**
 * The `reimbursements` parameter of preview_payroll and run_payroll.
 *
 * ⛔ The SAME shape and limits as the REST API's `employees[].reimbursements`
 * (`POST /api/v1/payroll/preview` and `/run`): at most 10 lines, each a type,
 * an amount from 0 to 9,999, optional miles from 0 to 9,999 and an optional
 * per-mile rate from 0 to 5. The tool sends the lines through unchanged, so
 * any limit declared here that the API does not share either refuses a
 * payroll the API would run or lets through one it will refuse. A test in the
 * application repository holds the two schemas to the same boundaries.
 */
import { z } from "zod";

export const MAX_REIMBURSEMENT_LINES = 10;

export const reimbursementLineSchema = z.object({
  type: z
    .enum(["transit", "parking", "mileage", "other"])
    .describe("transit, parking, mileage or other"),
  description: z.string().max(200).optional().describe("Optional. What it was for, as the pay stub should show it."),
  amount: z
    .number()
    .min(0)
    .max(9999)
    .describe(
      "Dollars. For a mileage line with miles, send 0: NannyKeeper prices the miles and ignores this amount."
    ),
  miles: z
    .number()
    .min(0)
    .max(9999)
    .optional()
    .describe("Mileage lines: the miles driven this pay period."),
  rate_per_mile: z
    .number()
    .min(0)
    .max(5)
    .optional()
    .describe(
      "Optional, mileage lines only. Leave it out and NannyKeeper uses the IRS business mileage rate it holds for the " +
        "pay period and pay date. If it holds none for that year, the payroll is refused with mileage_rate_unavailable; pass the rate " +
        "your agreement sets to continue."
    ),
});

export const reimbursementsParam = z
  .array(reimbursementLineSchema)
  .max(MAX_REIMBURSEMENT_LINES)
  .optional()
  .describe(
    "Optional. Up to 10 reimbursements paid with this paycheck: mileage, transit, parking or other. " +
      "NannyKeeper adds them to net pay, outside gross pay, without calculating tax on them; a transit or parking " +
      "line over the monthly limit, or in a year whose limit NannyKeeper does not hold, comes back with a warning. " +
      'Mileage example: [{"type":"mileage","miles":42,"amount":0}].'
  );

export type ReimbursementLine = z.infer<typeof reimbursementLineSchema>;
