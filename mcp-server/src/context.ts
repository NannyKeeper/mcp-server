/** A hosted request supplies its own credentials. Never change process.env per user. */
export interface ToolContext {
  apiKey: string;
  apiBase: string;
  publicConnection?: boolean;
}

export function getToolContext(context?: ToolContext): ToolContext {
  return context ?? {
    apiKey: process.env.NANNYKEEPER_API_KEY ?? "",
    apiBase: process.env.NANNYKEEPER_API_URL || "https://www.nannykeeper.com",
  };
}
