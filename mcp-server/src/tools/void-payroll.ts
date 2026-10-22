/**
 * void_payroll: the "safe void", over
 * `POST /api/v1/payroll/:id/void`.
 *
 * Two calls, never one. Without `confirmation_code` the API writes nothing and
 * answers with the payroll (employees, period, gross, pay date) and a code
 * that works for 10 minutes, bound to that payroll and this key. The void
 * happens only when the code comes back, so the assistant has to show the
 * family what it is about to undo and get a yes.
 *
 * Only a draft, or a scheduled direct deposit whose debit has not started.
 * Anything with money on the move, and every completed payroll, is refused
 * with a link to void it in the app: money that is already on the move is
 * never voided from an assistant.
 *
 * ⛔ The tool passes the API's answer through. It never retries a refusal and
 * never mints or remembers a code itself; the API owns both.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CLIENT_HEADER, getToolContext, type ToolContext } from "../context.ts";
import { EMPLOYER_ID_OPTIONAL } from "../params.ts";
import { toolResult } from "../public-profile.ts";

export const voidPayrollTool = {
  name: "void_payroll",
  description:
    "Void a payroll that has not moved any money: a draft, or a scheduled direct deposit whose bank debit has " +
    "not started. Two steps. First call it with payroll_id only: nothing is voided, and you get the payroll " +
    "(employees, pay period, gross, pay date) and a confirmation_code that works for 10 minutes. Show the user " +
    "that payroll and ask them to confirm. Only after they say yes, call it again with the same payroll_id, the " +
    "confirmation_code and a short reason. A payroll with money already on the move (approved, processing, " +
    "funded or paid) or a completed one is refused with code payroll_not_voidable_via_api and an app_url: give " +
    "the user that link to void it in the NannyKeeper app, and do not retry. If the code is refused " +
    "(confirmation_expired, confirmation_invalid, payroll_changed), start again from the first step and confirm " +
    "with the user again. For a household other than the key's own, pass its employer_id.",
} as const;

/** The hosted (public listing) copy: no sign-up or pricing prompts. */
const VOID_PAYROLL_PUBLIC_DESCRIPTION =
  "Void a payroll that has not moved any money: a draft, or a scheduled direct deposit whose debit has not started. Two steps: call with payroll_id only to get the payroll and a confirmation_code (nothing is voided), show the user that payroll and get their explicit confirmation, then call again with the code and a reason. A payroll with money already on the move, or a completed one, is refused with an app_url; give the user that link and do not retry.";

export async function executeVoidPayroll(
  args: { payroll_id: string; confirmation_code?: string; reason?: string; employer_id?: string },
  context?: ToolContext,
): Promise<string> {
  const { apiKey, apiBase } = getToolContext(context);
  if (!apiKey) {
    return JSON.stringify({
      error: "NANNYKEEPER_API_KEY environment variable is not set. Get a key at nannykeeper.com/developers/keys",
    });
  }
  try {
    const response = await fetch(`${apiBase}/api/v1/payroll/${encodeURIComponent(args.payroll_id)}/void`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...CLIENT_HEADER },
      body: JSON.stringify({
        ...(args.confirmation_code ? { confirmation_code: args.confirmation_code } : {}),
        ...(args.reason ? { reason: args.reason } : {}),
        ...(args.employer_id ? { employer_id: args.employer_id } : {}),
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 429) {
        return JSON.stringify({ error: "Rate limit exceeded. Please wait before retrying." });
      }
      return JSON.stringify({
        error: data.error?.message || `API error: ${response.status}`,
        // The stable name of the refusal, which the description tells the
        // agent to act on (payroll_not_voidable_via_api, confirmation_expired…).
        code: data.error?.code,
        details: data.error?.details,
      });
    }
    return JSON.stringify(data);
  } catch (error) {
    return JSON.stringify({
      error: `Network error: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
}

/**
 * Registered from this module, like `list_payrolls`, so the tool owns its
 * whole surface. Two calls: the first returns the payroll and a confirmation
 * code and writes nothing; the second, with the code, voids. Only a draft or a
 * scheduled direct deposit whose debit has not started; the API refuses
 * everything else with a link to the app.
 */
export function registerVoidPayroll(server: McpServer, context?: ToolContext) {
  server.tool(
    voidPayrollTool.name,
    context?.publicConnection ? VOID_PAYROLL_PUBLIC_DESCRIPTION : voidPayrollTool.description,
    {
      payroll_id: z.string().uuid().describe("The payroll id from get_payroll, list_payrolls or run_payroll."),
      confirmation_code: z
        .string()
        .min(1)
        .max(1024)
        .optional()
        .describe("Leave it out on the first call. Then pass the code the first call returned, only after the user confirmed."),
      reason: z
        .string()
        .trim()
        .min(1)
        .max(500)
        .optional()
        .describe("Required with confirmation_code: why the payroll is being voided, in a few words (for example 'Wrong hours')."),
      employer_id: EMPLOYER_ID_OPTIONAL,
    },
    {
      title: "Void Payroll",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    async (args) => toolResult(await executeVoidPayroll(args, context), context?.publicConnection),
  );
}
