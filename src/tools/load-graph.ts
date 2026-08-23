import { randomUUID } from "node:crypto";
import { Type, type Static } from "@sinclair/typebox";
import { z } from "zod";
import type { GraphRegistry } from "../server/registry.js";
import type { MaltegoConfig } from "../config.js";
import { readMtgxFile } from "../graph/reader.js";
import { confineToOutputDir } from "../server/paths.js";
import { jsonToolResult } from "./_shared.js";

const Schema = Type.Object(
  { path: Type.String({ description: "Path to a .mtgx file inside outputDir." }) },
  { additionalProperties: false },
);
type Input = Static<typeof Schema>;

export const mcpInputShape = {
  path: z.string().describe("Path to a .mtgx file inside outputDir."),
};

export interface ToolDeps { registry: GraphRegistry; config: MaltegoConfig; }

export function createLoadGraphTool(deps: ToolDeps) {
  return {
    name: "maltego_load_graph",
    label: "maltego: load graph",
    description: "Load an existing .mtgx into a new graph handle. Returns the new graphId.",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const input = raw as Input;
      const resolved = confineToOutputDir(input.path, deps.config.outputDir);
      const newId = `g-${randomUUID()}`;
      const g = await readMtgxFile(resolved, newId);
      deps.registry.register(g);
      return jsonToolResult({ graphId: g.id, entityCount: g.entityCount(), linkCount: g.linkCount() });
    },
  };
}
