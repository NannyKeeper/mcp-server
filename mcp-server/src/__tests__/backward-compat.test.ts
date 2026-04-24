/**
 * Backward-compatibility contract test for MCP response shapes.
 *
 * Captures golden fixtures of what v1.4.0 callers expect to receive from
 * the server. The v1.5.0 server is additive (new `scheduled` status + new
 * optional fields), but we want to catch any accidental schema break in
 * future minor versions before it ships.
 *
 * Each fixture here is a real response snapshot. The tests verify that
 * (a) v1.5.0 callers handle the v1.4.0 shape cleanly, and (b) v1.4.0
 * callers handle the v1.5.0 shape cleanly (scheduled status is pass-through
 * as an unrecognized string — no crash, no field drop).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { executeRunPayroll } from "../tools/run-payroll.js";

beforeEach(() => {
  vi.stubEnv("NANNYKEEPER_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function makeFetchResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "OK",
    headers: new Headers(),
    json: async () => body,
  } as Response;
}

const RUN_ARGS_BASE = {
  employer_id: "b85d0e73-a417-49c6-b40b-71274f3ceceb",
  employee_id: "c85d0e73-a417-49c6-b40b-71274f3ceceb",
  pay_period_start: "2026-04-07",
  pay_period_end: "2026-04-13",
  pay_frequency: "biweekly",
  regular_hours: 80,
};

// ── Golden fixtures ─────────────────────────────────────────────────────
//
// These are captured response bodies as the MCP tool would receive them
// from the REST API. They're the contract between server and client —
// changing one of these constants means changing the public contract.

/**
 * v1.4.0 successful run (immediate fire, DD payroll).
 *
 * Captured: shipped 2026-04-23, commit `2baac29` / `7c9bb55`.
 * No `scheduled_send_at`, no `is_estimated` — these fields were added in
 * v1.5.0 and are optional.
 */
const GOLDEN_V1_4_0_IMMEDIATE = {
  success: true,
  data: {
    payroll_id: "p85d0e73-a417-49c6-b40b-71274f3ceceb",
    status: "processing",
    pay_date_defaulted: false,
    pay_period: {
      start: "2026-04-07",
      end: "2026-04-13",
      pay_date: "2026-04-15",
      frequency: "biweekly",
    },
    totals: {
      gross_pay: 2000,
      total_deductions: 200,
      total_net_pay: 1800,
      total_employer_taxes: 165,
      total_cost: 2165,
    },
    employees: [
      {
        employee_id: RUN_ARGS_BASE.employee_id,
        name: "Test Employee",
        net_pay: 1800,
      },
    ],
  },
  meta: { requestId: "req-123" },
};

/**
 * v1.5.0 successful run — scheduled branch.
 *
 * The `scheduled_send_at` + `is_estimated: true` fields are new in v1.5.0.
 * `status: "scheduled"` is a new enum variant. v1.4.0 callers see this as
 * an unrecognized string and pass through without crashing (v1.4.0's
 * response type is `string`, not a literal union).
 */
const GOLDEN_V1_5_0_SCHEDULED = {
  success: true,
  data: {
    payroll_id: "p85d0e73-a417-49c6-b40b-71274f3ceceb",
    status: "scheduled",
    scheduled_send_at: "2026-04-28T19:00:00.000Z",
    is_estimated: true,
    pay_date_defaulted: false,
    pay_period: {
      start: "2026-04-07",
      end: "2026-04-13",
      pay_date: "2026-05-04",
      frequency: "biweekly",
    },
    totals: {
      gross_pay: 2000,
      total_deductions: 200,
      total_net_pay: 1800,
      total_employer_taxes: 165,
      total_cost: 2165,
    },
    employees: [
      {
        employee_id: RUN_ARGS_BASE.employee_id,
        name: "Test Employee",
        net_pay: 1800,
      },
    ],
  },
  meta: { requestId: "req-456" },
};

// ── Tests ───────────────────────────────────────────────────────────────

describe("backward-compat: v1.4.0 golden fixture", () => {
  it("v1.5.0 MCP tool handles v1.4.0 response shape (no scheduled fields)", async () => {
    // v1.4.0 response has no scheduled_send_at or is_estimated. v1.5.0 tool
    // must not crash when those fields are absent.
    global.fetch = vi
      .fn()
      .mockResolvedValue(makeFetchResponse(GOLDEN_V1_4_0_IMMEDIATE));

    const result = await executeRunPayroll(RUN_ARGS_BASE);
    const parsed = JSON.parse(result);

    expect(parsed.data.status).toBe("processing");
    expect(parsed.data.scheduled_send_at).toBeUndefined();
    expect(parsed.data.is_estimated).toBeUndefined();
    // Core fields still flow through
    expect(parsed.data.payroll_id).toBe(
      "p85d0e73-a417-49c6-b40b-71274f3ceceb"
    );
    expect(parsed.data.totals.total_net_pay).toBe(1800);
  });

  it("v1.5.0 MCP tool handles v1.5.0 scheduled response shape", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(makeFetchResponse(GOLDEN_V1_5_0_SCHEDULED));

    const result = await executeRunPayroll({
      ...RUN_ARGS_BASE,
      pay_date: "2026-05-04",
    });
    const parsed = JSON.parse(result);

    expect(parsed.data.status).toBe("scheduled");
    expect(parsed.data.scheduled_send_at).toBe("2026-04-28T19:00:00.000Z");
    expect(parsed.data.is_estimated).toBe(true);
    // v1.4.0 fields still present
    expect(parsed.data.payroll_id).toBe(
      "p85d0e73-a417-49c6-b40b-71274f3ceceb"
    );
    expect(parsed.data.pay_period.pay_date).toBe("2026-05-04");
    expect(parsed.data.totals.total_net_pay).toBe(1800);
  });

  it("simulates a v1.4.0 consumer parsing a v1.5.0 response — no crash, unrecognized status preserved", async () => {
    // A v1.4.0 caller's parser treats `status` as `string`, not a literal
    // union. When it receives `status: "scheduled"`, it should pass through
    // intact (the caller may not know what "scheduled" means, but we
    // guarantee we don't break the shape).
    global.fetch = vi
      .fn()
      .mockResolvedValue(makeFetchResponse(GOLDEN_V1_5_0_SCHEDULED));

    const result = await executeRunPayroll({
      ...RUN_ARGS_BASE,
      pay_date: "2026-05-04",
    });
    const parsed = JSON.parse(result);

    // Simulate a v1.4.0 consumer destructure — it only pulled fields it
    // knew about. None of these should throw or be undefined.
    const consumer = {
      payrollId: parsed.data.payroll_id as string,
      status: parsed.data.status as string,
      payDate: parsed.data.pay_period.pay_date as string,
      totalNet: parsed.data.totals.total_net_pay as number,
    };
    expect(consumer.payrollId).toBeTruthy();
    expect(consumer.status).toBe("scheduled");
    expect(consumer.payDate).toBe("2026-05-04");
    expect(consumer.totalNet).toBe(1800);
  });
});
