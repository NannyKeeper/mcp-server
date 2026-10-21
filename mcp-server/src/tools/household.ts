/**
 * Household read tools: list_employees, get_payroll, get_pay_stub (1.15.0),
 * get_w2 and get_schedule_h (1.16.0).
 *
 * list_employees is how an agent learns the employee_id every payroll tool
 * needs (and the household's employer_id). Without it, an agent with a
 * single-household key has no tool that returns either ID.
 */

import { getToolContext, type ToolContext } from "../context.ts";

const MISSING_KEY =
  "NANNYKEEPER_API_KEY environment variable is not set. Get a key at nannykeeper.com/developers/keys";

async function getJson(
  path: string,
  init: RequestInit,
  context?: ToolContext,
): Promise<{ ok: true; data: unknown } | { ok: false; text: string }> {
  const { apiKey, apiBase } = getToolContext(context);
  if (!apiKey) return { ok: false, text: JSON.stringify({ error: MISSING_KEY }) };
  try {
    const response = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    const data = await response.json();
    if (!response.ok) {
      return {
        ok: false,
        text: JSON.stringify({
          error: data.error?.message || `API error: ${response.status}`,
          // The stable name of the refusal (payroll_not_completed,
          // w2_not_generated, schedule_h_unavailable), which the tool
          // descriptions tell an agent to look for.
          code: data.error?.code,
          details: data.error?.details,
        }),
      };
    }
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      text: JSON.stringify({
        error: `Network error: ${error instanceof Error ? error.message : "Unknown error"}`,
      }),
    };
  }
}

export async function executeListEmployees(
  args: { employer_id?: string },
  context?: ToolContext,
): Promise<string> {
  const params = new URLSearchParams();
  if (args.employer_id) params.set("employer_id", args.employer_id);
  const query = params.toString();
  const result = await getJson(`/api/v1/employees${query ? `?${query}` : ""}`, { method: "GET" }, context);
  return result.ok ? JSON.stringify(result.data) : result.text;
}

export async function executeGetPayroll(
  args: { payroll_id?: string; employer_id?: string },
  context?: ToolContext,
): Promise<string> {
  const params = new URLSearchParams();
  if (args.employer_id) params.set("employer_id", args.employer_id);
  const query = params.toString();
  // One payroll is scoped by its own household on the server, so only the
  // list takes employer_id.
  const path = args.payroll_id
    ? `/api/v1/payroll/${encodeURIComponent(args.payroll_id)}`
    : `/api/v1/payrolls${query ? `?${query}` : ""}`;
  const result = await getJson(path, { method: "GET" }, context);
  return result.ok ? JSON.stringify(result.data) : result.text;
}

type ToolContent =
  | { type: "text"; text: string }
  | { type: "resource"; resource: { uri: string; mimeType: string; blob: string } };

/**
 * Returns a short text summary plus each stub as an embedded PDF resource,
 * so the PDF reaches the client as a file rather than as ~120 KB of base64
 * text in the model's context.
 */
export async function executeGetPayStub(
  args: { payroll_id: string; employee_id?: string; employer_id?: string },
  context?: ToolContext,
): Promise<{ content: ToolContent[]; isError?: true }> {
  const result = await getJson(
    "/api/v1/documents/paystub",
    {
      method: "POST",
      body: JSON.stringify({
        payroll_id: args.payroll_id,
        ...(args.employee_id ? { employee_id: args.employee_id } : {}),
        ...(args.employer_id ? { employer_id: args.employer_id } : {}),
      }),
    },
    context,
  );
  if (!result.ok) {
    return { content: [{ type: "text", text: result.text }], isError: true };
  }
  const data = (result.data as {
    data?: {
      payroll_id: string;
      // A refused employee comes back as { employee_id, error } instead.
      documents: Array<{
        employee_id: string;
        document_id?: string;
        file_name?: string;
        mime_type?: string;
        data?: string | null;
        error?: string;
      }>;
    };
  }).data;
  const documents = data?.documents ?? [];
  const summary = {
    payroll_id: data?.payroll_id ?? args.payroll_id,
    documents: documents.map((d) =>
      d.error
        ? { employee_id: d.employee_id, error: d.error }
        : {
            employee_id: d.employee_id,
            document_id: d.document_id,
            file_name: d.file_name,
            attached: Boolean(d.data),
          }
    ),
  };
  const content: ToolContent[] = [{ type: "text", text: JSON.stringify(summary) }];
  for (const d of documents) {
    if (!d.data || !d.document_id) continue;
    content.push({
      type: "resource",
      resource: {
        uri: `nannykeeper://pay-stubs/${d.document_id}/${encodeURIComponent(d.file_name ?? "pay-stub.pdf")}`,
        mimeType: d.mime_type || "application/pdf",
        blob: d.data,
      },
    });
  }
  return { content };
}

/**
 * One tax form, as a DOWNLOAD LINK and never as the PDF (1.16.0).
 *
 * ⛔ A W-2 prints the employee's full Social Security number, and a tool
 * result is read by the assistant's model. So these tools always ask the API
 * for `delivery: "link"`: the result is a link on nannykeeper.com that works
 * for 15 minutes, and the person opens it in their own browser. The pay stub
 * is attached as a file because it shows only the last four digits; do not
 * "align" these two with it.
 */
async function getTaxFormLink(
  path: string,
  body: Record<string, unknown>,
  context?: ToolContext,
): Promise<string> {
  const result = await getJson(
    path,
    { method: "POST", body: JSON.stringify({ ...body, delivery: "link" }) },
    context,
  );
  if (!result.ok) return result.text;
  const data = (result.data as {
    data?: {
      download?: { url?: string; expires_at?: string; file_name?: string };
      // Never forwarded, even if a server answered with one.
      document?: unknown;
    } & Record<string, unknown>;
  }).data;
  const { download, document: _document, ...rest } = data ?? {};
  if (!download?.url) {
    return JSON.stringify({ error: "NannyKeeper did not return a download link. Ask again in a minute." });
  }
  return JSON.stringify({
    ...rest,
    file_name: download.file_name,
    download_url: download.url,
    expires_at: download.expires_at,
    instructions:
      "Give the user this link and tell them to open it in their browser to download the PDF. " +
      "It works for 15 minutes. Do not open or fetch the link yourself.",
  });
}

export async function executeGetW2(
  args: { employee_id: string; tax_year: number; copy?: string; employer_id?: string },
  context?: ToolContext,
): Promise<string> {
  return getTaxFormLink(
    "/api/v1/documents/w2",
    {
      employee_id: args.employee_id,
      tax_year: args.tax_year,
      ...(args.copy ? { copy: args.copy } : {}),
      ...(args.employer_id ? { employer_id: args.employer_id } : {}),
    },
    context,
  );
}

export async function executeGetScheduleH(
  args: { tax_year: number; employer_id?: string },
  context?: ToolContext,
): Promise<string> {
  return getTaxFormLink(
    "/api/v1/documents/schedule-h",
    {
      tax_year: args.tax_year,
      ...(args.employer_id ? { employer_id: args.employer_id } : {}),
    },
    context,
  );
}

/**
 * get_quarter_taxes (1.17.0): a quarter's tax figures as the Taxes quarter
 * page shows them. Passed through unchanged: the API already says
 * null where it will not stand behind a figure, and a tool that summarised it
 * could turn that null into a 0.
 */
export async function executeGetQuarterTaxes(
  args: { year: number; quarter: number; employer_id?: string },
  context?: ToolContext,
): Promise<string> {
  const params = new URLSearchParams({ year: String(args.year), quarter: String(args.quarter) });
  if (args.employer_id) params.set("employer_id", args.employer_id);
  const result = await getJson(`/api/v1/taxes/quarterly?${params.toString()}`, { method: "GET" }, context);
  return result.ok ? JSON.stringify(result.data) : result.text;
}
