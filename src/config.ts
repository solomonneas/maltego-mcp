import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
  outputDir: string;
  lookupTimeoutMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const outputDir = env.MALTEGO_MCP_OUTPUT_DIR ?? join(homedir(), "MaltegoGraphs");
  const timeoutStr = env.MALTEGO_MCP_LOOKUP_TIMEOUT_MS;
  const parsed = timeoutStr ? parseInt(timeoutStr, 10) : NaN;
  const lookupTimeoutMs = Number.isFinite(parsed) && parsed > 0 ? parsed : 30_000;
  return { outputDir, lookupTimeoutMs };
}
