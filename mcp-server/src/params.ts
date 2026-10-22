import { z } from "zod";

/**
 * `employer_id` on every household tool (1.15.0). The API defaults it to the
 * household the key belongs to, so a single-household caller never needs it.
 * Do not make it required again: list_employees is the only place an agent
 * can learn it, and a required parameter it cannot fill stops the flow.
 *
 * Shared, never copied: a tool registered from its own module imports it
 * here, so a change reaches every tool.
 */
export const EMPLOYER_ID_OPTIONAL = z
  .string()
  .uuid()
  .optional()
  .describe(
    "Optional. Leave it out to use the household your API key belongs to. Pass it only when one account manages several households; list_employees returns it."
  );
