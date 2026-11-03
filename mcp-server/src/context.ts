/**
 * What a hosted connection narrows. Absent, the server offers every
 * tool exactly as the npm package does. The policy itself (which assistant
 * gets which tools, and the refusal copy) lives with the host, which knows the
 * assistant; this package only applies it.
 */
export interface ConnectionLimits {
  /** The tools this connection offers. Any other is neither listed nor callable. */
  tools: readonly string[];
  /** MCP server instructions sent to the assistant on initialize. */
  instructions?: string;
  /** A description that replaces the hosted default for that tool. */
  descriptions?: Readonly<Record<string, string>>;
  /**
   * Called before an offered tool runs. Returns the JSON text to answer with
   * instead of running it, or null to run it. A guard here is the first of
   * two: the API refuses the same calls for the connection's key.
   */
  refuse?: (tool: string, args: Record<string, unknown>) => string | null;
}

/** A hosted request supplies its own credentials. Never change process.env per user. */
export interface ToolContext {
  apiKey: string;
  apiBase: string;
  publicConnection?: boolean;
  connection?: ConnectionLimits;
}

export function getToolContext(context?: ToolContext): ToolContext {
  return context ?? {
    apiKey: process.env.NANNYKEEPER_API_KEY ?? "",
    apiBase: process.env.NANNYKEEPER_API_URL || "https://www.nannykeeper.com",
  };
}

/**
 * Sent with every API request. A label that lets NannyKeeper count MCP use of
 * an endpoint separately from direct API use of the same endpoint; the API
 * never grants or refuses anything because of it.
 */
export const CLIENT_HEADER = { "X-NannyKeeper-Client": "mcp" } as const;
