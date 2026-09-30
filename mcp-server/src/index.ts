#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRequire } from "node:module";
import { createNannyKeeperServer } from "./server.js";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };
const server = createNannyKeeperServer(version);
server.connect(new StdioServerTransport()).catch((error) => {
  console.error("Failed to start NannyKeeper MCP server:", error);
  process.exit(1);
});
