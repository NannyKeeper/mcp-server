/**
 * Household read tools: list_employees, get_payroll, get_pay_stub (1.15.0).
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
