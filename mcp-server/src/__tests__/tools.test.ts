/**
 * Unit tests for MCP tool handlers: calculate_nanny_taxes and check_threshold.
 *
 * Fetch is mocked via vi.fn() so no real HTTP calls are made.
 * Each test group restores the env and resets mocks to keep tests isolated.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { executeCalculate } from "../tools/calculate.js";
import { executeThreshold } from "../tools/threshold.js";
import { executePreviewPayroll } from "../tools/preview-payroll.js";
import { executeRunPayroll } from "../tools/run-payroll.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal fetch Response mock. */
function makeFetchResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

/** Minimal valid calculate API response (mirrors the real API shape). */
const CALCULATE_SUCCESS_RESPONSE = {
  tax_year: 2026,
  state: "CA",
  state_name: "California",
  annual_wages: 30000,
  pay_frequency: "biweekly",
  employer_taxes: {
    social_security: 1860,
    medicare: 435,
    futa: 42,
    state_unemployment: 1110,
    total: 3447,
    effective_rate: 11.49,
  },
  employee_taxes_estimate: {
    federal_income_tax: 1898,
    state_income_tax: 450,
    social_security: 1860,
    medicare: 435,
    total: 4643,
    note: "Estimate based on standard deduction.",
  },
  per_paycheck: {
    gross_pay: 1153.85,
    employer_taxes: 132.58,
    total_cost: 1286.43,
    periods_per_year: 26,
  },
  threshold: {
    fica_threshold: 3000,
    federal_status: "above",
    action_required: true,
    state_suta_status: "above",
    state_suta_threshold: 750,
  },
  limitations: [
    "This estimate assumes $0 in prior wages this year.",
    "State unemployment rate uses the new-employer default.",
  ],
  next_actions: {
    available: ["calculate", "check_threshold"],
    requires_account: [
      { action: "run_payroll", description: "Calculate exact taxes with YTD tracking" },
    ],
    signup_url: "https://www.nannykeeper.com/signup?ref=test_abc123&utm_source=api&utm_medium=agent",
  },
  continue_url: "https://www.nannykeeper.com/signup?ref=test_abc123&prefill_state=CA&prefill_wages=30000",
};

/** Minimal valid threshold API response. */
const THRESHOLD_SUCCESS_RESPONSE = {
  tax_year: 2026,
  state: "CA",
  annual_wages: 30000,
  federal: {
    fica_threshold: 3000,
    approaching_threshold: 2400,
    status: "above",
    action_required: true,
    explanation:
      "At $30,000/year, you exceed the $3,000 FICA threshold for 2026. You are a household employer.",
  },
  state_threshold: {
    threshold_quarterly: 750,
    status: "above",
    explanation: "CA has a lower state threshold of $750/quarter.",
  },
  futa: {
    quarterly_threshold: 1000,
    note: "FUTA is triggered when you pay $1,000+ in any calendar quarter.",
  },
  next_actions: {
    available: ["calculate", "check_threshold"],
    requires_account: [
      { action: "run_payroll", description: "Calculate exact taxes and generate a pay stub" },
    ],
    signup_url: "https://www.nannykeeper.com/signup?ref=test_abc123&utm_source=api&utm_medium=agent",
  },
};

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

const originalFetch = global.fetch;

beforeEach(() => {
  // Provide a valid API key by default; individual tests may delete it.
  process.env.NANNYKEEPER_API_KEY = "test_key_abc123";
  process.env.NANNYKEEPER_API_URL = "https://mock.nannykeeper.com";
});

afterEach(() => {
  vi.restoreAllMocks();
  global.fetch = originalFetch;
  delete process.env.NANNYKEEPER_API_KEY;
  delete process.env.NANNYKEEPER_API_URL;
});

// ---------------------------------------------------------------------------
// calculate_nanny_taxes
// ---------------------------------------------------------------------------

describe("executeCalculate (calculate_nanny_taxes)", () => {
  it("returns a formatted JSON result for valid inputs", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      makeFetchResponse(CALCULATE_SUCCESS_RESPONSE, 200)
    );

    const result = await executeCalculate({
      state: "CA",
      annual_wages: 30000,
      pay_frequency: "biweekly",
    });

    const parsed = JSON.parse(result);
    expect(parsed.state).toBe("CA");
    expect(parsed.annual_wages).toBe(30000);
    expect(parsed.employer_taxes).toBeDefined();
    expect(parsed.employer_taxes.total).toBeGreaterThan(0);
    expect(parsed.threshold.action_required).toBe(true);
    expect(parsed.next_actions.signup_url).toContain("nannykeeper.com/signup");
  });

  it("uppercases the state code before sending to the API", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      makeFetchResponse(CALCULATE_SUCCESS_RESPONSE, 200)
    );

    await executeCalculate({ state: "ca", annual_wages: 30000 });

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.state).toBe("CA");
  });

  it("defaults pay_frequency to biweekly when not provided", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      makeFetchResponse(CALCULATE_SUCCESS_RESPONSE, 200)
    );

    await executeCalculate({ state: "NY", annual_wages: 20000 });

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.pay_frequency).toBe("biweekly");
  });

  it("returns a clear error when NANNYKEEPER_API_KEY is not set", async () => {
    delete process.env.NANNYKEEPER_API_KEY;

    const result = await executeCalculate({ state: "TX", annual_wages: 25000 });
    const parsed = JSON.parse(result);

    expect(parsed.error).toContain("NANNYKEEPER_API_KEY");
    expect(parsed.error).toContain("nannykeeper.com/developers/keys");
  });

  it("returns rate limit error on 429 response", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      makeFetchResponse({ error: { message: "Too many requests" } }, 429)
    );

    const result = await executeCalculate({ state: "FL", annual_wages: 15000 });
    const parsed = JSON.parse(result);

    expect(parsed.error).toContain("Rate limit exceeded");
    expect(parsed.error).toContain("50 requests/day");
  });

  it("returns server error message on 500 response", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      makeFetchResponse({ error: { message: "Internal server error" } }, 500)
    );

    const result = await executeCalculate({ state: "WA", annual_wages: 40000 });
    const parsed = JSON.parse(result);

    expect(parsed.error).toBeTruthy();
    expect(typeof parsed.error).toBe("string");
  });

  it("returns server error using status code when API error body has no message", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      makeFetchResponse({}, 500)
    );

    const result = await executeCalculate({ state: "WA", annual_wages: 40000 });
    const parsed = JSON.parse(result);

    expect(parsed.error).toContain("500");
  });

  it("returns a network error when fetch throws", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Connection refused"));

    const result = await executeCalculate({ state: "OR", annual_wages: 10000 });
    const parsed = JSON.parse(result);

    expect(parsed.error).toContain("Network error");
    expect(parsed.error).toContain("Connection refused");
  });

  it("sends the Authorization header with the API key", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      makeFetchResponse(CALCULATE_SUCCESS_RESPONSE, 200)
    );

    await executeCalculate({ state: "IL", annual_wages: 35000 });

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer test_key_abc123"
    );
  });
});

// ---------------------------------------------------------------------------
// check_threshold
// ---------------------------------------------------------------------------

describe("executeThreshold (check_threshold)", () => {
  it("returns threshold status for valid inputs", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      makeFetchResponse(THRESHOLD_SUCCESS_RESPONSE, 200)
    );

    const result = await executeThreshold({ state: "CA", annual_wages: 30000 });
    const parsed = JSON.parse(result);

    expect(parsed.state).toBe("CA");
    expect(parsed.annual_wages).toBe(30000);
    expect(parsed.federal.status).toBe("above");
    expect(parsed.federal.action_required).toBe(true);
    expect(parsed.state_threshold).toBeDefined();
    expect(parsed.state_threshold.threshold_quarterly).toBe(750);
  });

  it("includes tax_year in the response when provided", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      makeFetchResponse({ ...THRESHOLD_SUCCESS_RESPONSE, tax_year: 2025 }, 200)
    );

    const result = await executeThreshold({
      state: "NY",
      annual_wages: 5000,
      tax_year: 2025,
    });
    const parsed = JSON.parse(result);

    expect(parsed.tax_year).toBe(2025);

    // Verify tax_year was forwarded in the query string
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("tax_year=2025");
  });

  it("uppercases the state code in the query string", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      makeFetchResponse(THRESHOLD_SUCCESS_RESPONSE, 200)
    );

    await executeThreshold({ state: "ca", annual_wages: 30000 });

    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("state=CA");
    expect(url).not.toContain("state=ca");
  });

  it("returns a clear error when NANNYKEEPER_API_KEY is not set", async () => {
    delete process.env.NANNYKEEPER_API_KEY;

    const result = await executeThreshold({ state: "TX", annual_wages: 5000 });
    const parsed = JSON.parse(result);

    expect(parsed.error).toContain("NANNYKEEPER_API_KEY");
    expect(parsed.error).toContain("nannykeeper.com/developers/keys");
  });

  it("returns an API error message on non-ok response", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      makeFetchResponse({ error: { message: "Invalid state code" } }, 422)
    );

    const result = await executeThreshold({ state: "ZZ", annual_wages: 5000 });
    const parsed = JSON.parse(result);

    expect(parsed.error).toBe("Invalid state code");
  });

  it("returns rate limit error on 429 response", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      makeFetchResponse({ error: { message: "Too many requests" } }, 429)
    );

    const result = await executeThreshold({ state: "FL", annual_wages: 10000 });
    const parsed = JSON.parse(result);

    // The threshold tool falls through to the generic error handler (no special 429 branch)
    expect(parsed.error).toBeTruthy();
    expect(typeof parsed.error).toBe("string");
  });

  it("returns server error on 500 response", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      makeFetchResponse({ error: { message: "Internal server error" } }, 500)
    );

    const result = await executeThreshold({ state: "WA", annual_wages: 20000 });
    const parsed = JSON.parse(result);

    expect(parsed.error).toBe("Internal server error");
  });

  it("returns server error using status code when error body has no message", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      makeFetchResponse({}, 500)
    );

    const result = await executeThreshold({ state: "WA", annual_wages: 20000 });
    const parsed = JSON.parse(result);

    expect(parsed.error).toContain("500");
  });

  it("returns a network error when fetch throws", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("DNS lookup failed"));

    const result = await executeThreshold({ state: "AZ", annual_wages: 5000 });
    const parsed = JSON.parse(result);

    expect(parsed.error).toContain("Network error");
    expect(parsed.error).toContain("DNS lookup failed");
  });

  it("omits tax_year from query string when not provided", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      makeFetchResponse(THRESHOLD_SUCCESS_RESPONSE, 200)
    );

    await executeThreshold({ state: "TX", annual_wages: 5000 });

    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).not.toContain("tax_year");
  });
});

// ---------------------------------------------------------------------------
// preview_payroll
// ---------------------------------------------------------------------------

const PREVIEW_SUCCESS_RESPONSE = {
  preview: true,
  pay_date_defaulted: false,
  pay_period: {
    start: "2026-04-13",
    end: "2026-04-19",
    pay_date: "2026-04-24",
    frequency: "weekly",
  },
  employees: [],
  totals: {
    gross_pay: 800,
    total_deductions: 61.2,
    total_net_pay: 738.8,
    total_employer_taxes: 61.2,
    total_cost: 861.2,
  },
};

const PREVIEW_ARGS_BASE = {
  employer_id: "11111111-1111-4111-8111-111111111111",
  employee_id: "22222222-2222-4222-8222-222222222222",
  pay_period_start: "2026-04-13",
  pay_period_end: "2026-04-19",
  pay_frequency: "weekly",
  regular_hours: 40,
};

describe("executePreviewPayroll (preview_payroll)", () => {
  it("includes pay_date in the request body when provided", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      makeFetchResponse(PREVIEW_SUCCESS_RESPONSE, 200)
    );

    await executePreviewPayroll({ ...PREVIEW_ARGS_BASE, pay_date: "2026-05-01" });

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.pay_date).toBe("2026-05-01");
  });

  it("OMITS pay_date from the request body when not provided (server computes default)", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      makeFetchResponse(PREVIEW_SUCCESS_RESPONSE, 200)
    );

    await executePreviewPayroll(PREVIEW_ARGS_BASE);

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body).not.toHaveProperty("pay_date");
  });

  it("returns error when NANNYKEEPER_API_KEY is not set", async () => {
    delete process.env.NANNYKEEPER_API_KEY;

    const result = await executePreviewPayroll(PREVIEW_ARGS_BASE);
    const parsed = JSON.parse(result);

    expect(parsed.error).toContain("NANNYKEEPER_API_KEY");
  });
});

// ---------------------------------------------------------------------------
// run_payroll
// ---------------------------------------------------------------------------

const RUN_SUCCESS_RESPONSE = {
  payroll_id: "33333333-3333-4333-8333-333333333333",
  status: "completed",
  pay_date_defaulted: true,
  pay_period: {
    start: "2026-04-13",
    end: "2026-04-19",
    pay_date: "2026-04-30",
    frequency: "weekly",
  },
  employees: [],
  totals: {
    gross_pay: 800,
    total_deductions: 61.2,
    total_net_pay: 738.8,
    total_employer_taxes: 61.2,
    total_cost: 861.2,
  },
};

const RUN_ARGS_BASE = {
  employer_id: "11111111-1111-4111-8111-111111111111",
  employee_id: "22222222-2222-4222-8222-222222222222",
  pay_period_start: "2026-04-13",
  pay_period_end: "2026-04-19",
  pay_frequency: "weekly",
  regular_hours: 40,
};

describe("executeRunPayroll (run_payroll)", () => {
  it("includes pay_date in the request body when provided", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      makeFetchResponse(RUN_SUCCESS_RESPONSE, 200)
    );

    await executeRunPayroll({ ...RUN_ARGS_BASE, pay_date: "2026-05-01" });

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.pay_date).toBe("2026-05-01");
  });

  it("OMITS pay_date from the request body when not provided (server computes default)", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      makeFetchResponse(RUN_SUCCESS_RESPONSE, 200)
    );

    await executeRunPayroll(RUN_ARGS_BASE);

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body).not.toHaveProperty("pay_date");
  });

  it("includes confirm_large_payroll in the body only when explicitly provided", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      makeFetchResponse(RUN_SUCCESS_RESPONSE, 200)
    );

    await executeRunPayroll({ ...RUN_ARGS_BASE, confirm_large_payroll: true });

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.confirm_large_payroll).toBe(true);
  });

  it("includes confirm_ach_debit in the body only when explicitly provided", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      makeFetchResponse(RUN_SUCCESS_RESPONSE, 200)
    );

    await executeRunPayroll({ ...RUN_ARGS_BASE, confirm_ach_debit: true });

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.confirm_ach_debit).toBe(true);
  });

  it("omits confirm flags entirely when not provided (not sent as false)", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      makeFetchResponse(RUN_SUCCESS_RESPONSE, 200)
    );

    await executeRunPayroll(RUN_ARGS_BASE);

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body).not.toHaveProperty("confirm_large_payroll");
    expect(body).not.toHaveProperty("confirm_ach_debit");
  });

  it("forwards Idempotency-Key header when provided", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      makeFetchResponse(RUN_SUCCESS_RESPONSE, 200)
    );

    await executeRunPayroll({
      ...RUN_ARGS_BASE,
      idempotency_key: "payroll-2026-04-23-marta",
    });

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe(
      "payroll-2026-04-23-marta"
    );
  });

  it("surfaces next_valid_pay_date from the API's deadline rejection", async () => {
    const deadlineErrorResponse = {
      error: {
        code: "pay_date_past_deadline",
        message: "pay_date 2026-04-24 is past the submission deadline",
        details: {
          pay_date: "2026-04-24",
          next_valid_pay_date: "2026-05-05",
        },
      },
    };
    global.fetch = vi.fn().mockResolvedValue(
      makeFetchResponse(deadlineErrorResponse, 400)
    );

    const result = await executeRunPayroll({
      ...RUN_ARGS_BASE,
      pay_date: "2026-04-24",
    });
    const parsed = JSON.parse(result);

    expect(parsed.error).toContain("submission deadline");
    // details carry next_valid_pay_date so agents can self-correct
    expect(parsed.details?.next_valid_pay_date).toBe("2026-05-05");
  });

  it("returns error when NANNYKEEPER_API_KEY is not set", async () => {
    delete process.env.NANNYKEEPER_API_KEY;

    const result = await executeRunPayroll(RUN_ARGS_BASE);
    const parsed = JSON.parse(result);

    expect(parsed.error).toContain("NANNYKEEPER_API_KEY");
  });

  // ── v1.5.0: scheduled-payroll return status ────────────────────────────

  it("passes through scheduled status, scheduled_send_at, and is_estimated when the API schedules", async () => {
    // API returns status:'scheduled' + scheduled_send_at for far-future DD
    // pay_dates. The MCP tool is a passthrough — we verify no fields are
    // dropped on their way to the agent.
    const scheduledResponse = {
      success: true,
      data: {
        payroll_id: "payroll-uuid",
        status: "scheduled",
        scheduled_send_at: "2026-04-28T19:00:00.000Z",
        is_estimated: true,
        pay_date_defaulted: false,
        pay_period: {
          start: "2026-04-01",
          end: "2026-04-14",
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
      },
    };
    global.fetch = vi
      .fn()
      .mockResolvedValue(makeFetchResponse(scheduledResponse, 200));

    const result = await executeRunPayroll({
      ...RUN_ARGS_BASE,
      pay_date: "2026-05-04",
    });
    const parsed = JSON.parse(result);

    // MCP tool returns the full API envelope (`{success, data, meta}`).
    // The new fields sit on `data` — verify they made it through.
    expect(parsed.data.status).toBe("scheduled");
    expect(parsed.data.scheduled_send_at).toBe("2026-04-28T19:00:00.000Z");
    expect(parsed.data.is_estimated).toBe(true);
  });

  it("passes through processing status cleanly (v1.4.0-compat regression)", async () => {
    // Regression: ensure the scheduled branch didn't break the in-window
    // path. v1.4.0 callers expect status='processing'/'pending_funding'/
    // 'completed' and no scheduled_send_at field on these responses.
    const immediateResponse = {
      success: true,
      data: {
        payroll_id: "payroll-uuid",
        status: "processing",
        pay_date_defaulted: false,
        pay_period: {
          start: "2026-04-01",
          end: "2026-04-14",
          pay_date: "2026-04-24",
          frequency: "biweekly",
        },
        totals: {
          gross_pay: 2000,
          total_deductions: 200,
          total_net_pay: 1800,
          total_employer_taxes: 165,
          total_cost: 2165,
        },
      },
    };
    global.fetch = vi
      .fn()
      .mockResolvedValue(makeFetchResponse(immediateResponse, 200));

    const result = await executeRunPayroll(RUN_ARGS_BASE);
    const parsed = JSON.parse(result);

    expect(parsed.data.status).toBe("processing");
    expect(parsed.data.scheduled_send_at).toBeUndefined();
    expect(parsed.data.is_estimated).toBeUndefined();
  });
});
