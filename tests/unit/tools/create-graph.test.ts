import { describe, it, expect, beforeEach } from "vitest";
import { GraphRegistry } from "../../../src/server/registry.js";
import { createCreateGraphTool } from "../../../src/tools/create-graph.js";
import { resolveConfig } from "../../../src/config.js";

describe("create-graph tool", () => {
  it("rejects graph creation above the registry resource limit", async () => {
    const registry = new GraphRegistry({ maxGraphs: 100 });
    const tool = createCreateGraphTool({ registry, config: resolveConfig({}) });
    for (let i = 0; i < 100; i++) await tool.execute("test", { name: `graph-${i}` });
    await expect(tool.execute("test", { name: "one-too-many" })).rejects.toThrow(/resource limit/i);
    expect(registry.allIds()).toHaveLength(100);
  });
  let registry: GraphRegistry;
  beforeEach(() => {
    registry = new GraphRegistry();
  });

  it("has the expected name and description", () => {
    const tool = createCreateGraphTool({ registry, config: resolveConfig({}) });
    expect(tool.name).toBe("maltego_create_graph");
    expect(tool.description).toMatch(/graph/i);
  });

  it("creates a graph and returns graphId", async () => {
    const tool = createCreateGraphTool({ registry, config: resolveConfig({}) });
    const res = await tool.execute("test", { name: "demo" });
    expect(res.details).toMatchObject({ graphId: expect.stringMatching(/^g-/), name: "demo" });
    expect(registry.get(res.details.graphId)).toBeDefined();
  });

  it("rejects empty name", async () => {
    const tool = createCreateGraphTool({ registry, config: resolveConfig({}) });
    await expect(tool.execute("test", { name: "" })).rejects.toThrow(/name is required/);
  });
});
