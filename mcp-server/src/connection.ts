import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ConnectionLimits } from "./context.ts";

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };
type ToolCallback = (args: Record<string, unknown>, extra: unknown) => unknown;

/**
 * Applies a hosted connection's limits to every registration that follows.
 * Registrations live in server.ts and in their own modules, so the
 * limit wraps `server.tool` once rather than asking each one to check: a tool
 * added later is refused by default instead of offered by default. The other
 * registration methods throw under limits rather than bypass them.
 *
 * Every registration is `server.tool(name, description, shape, annotations,
 * callback)`; a test holds that, because a different overload would put the
 * callback somewhere this does not wrap.
 */
export function applyConnectionLimits(server: McpServer, limits: ConnectionLimits) {
  const register = server.tool.bind(server) as (...args: unknown[]) => unknown;
  (server as unknown as { tool: (...args: unknown[]) => unknown }).tool = (...args: unknown[]) => {
    const name = args[0];
    if (typeof name !== "string" || args.length !== 5 || typeof args[4] !== "function") {
      throw new Error(`Unexpected tool registration shape for ${String(name)}`);
    }
    if (!limits.tools.includes(name)) return undefined;
    const description = limits.descriptions?.[name] ?? args[1];
    const run = args[4] as ToolCallback;
    const guarded: ToolCallback = async (input, extra) => {
      const refusal = limits.refuse?.(name, input ?? {});
      if (refusal !== null && refusal !== undefined) {
        return { content: [{ type: "text", text: refusal }], isError: true } satisfies ToolResult;
      }
      return run(input, extra);
    };
    return register(name, description, args[2], args[3], guarded);
  };
  // The SDK's other registration paths skip the wrapper above, so under
  // limits they refuse outright: a tool registered that way would otherwise
  // reach the connection unlisted and unguarded. Extend this wrapper first.
  const refuse = (method: string) => (name: unknown) => {
    throw new Error(`${method}(${String(name)}) is not guarded by connection limits; register it with server.tool`);
  };
  (server as unknown as { registerTool: unknown }).registerTool = refuse("registerTool");
  const tasks = (server as unknown as { experimental?: { tasks?: { registerToolTask?: unknown } } }).experimental?.tasks;
  if (tasks) tasks.registerToolTask = refuse("registerToolTask");
}
