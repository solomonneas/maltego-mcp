import { describe, it, expect, beforeEach } from "vitest";
import { tmpdir } from "node:os";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { GraphRegistry } from "../../../src/server/registry.js";
import { graphToolHandlers } from "../../../src/tools/graph.js";

describe("graph tools", () => {
  let reg: GraphRegistry;
  let tmp: string;
  beforeEach(async () => {
    reg = new GraphRegistry();
    tmp = await mkdtemp(join(tmpdir(), "maltego-mcp-test-"));
  });

  it("maltego_create_graph creates a new graph", async () => {
    const tools = graphToolHandlers(reg, { outputDir: tmp });
    const res = await tools.maltego_create_graph({ name: "demo" });
    expect(res.graphId).toMatch(/^g-/);
    expect(reg.get(res.graphId)).toBeDefined();
  });

  it("maltego_add_entity and maltego_add_link build a graph", async () => {
    const tools = graphToolHandlers(reg, { outputDir: tmp });
    const { graphId } = await tools.maltego_create_graph({ name: "d" });
    const a = await tools.maltego_add_entity({ graphId, type: "Domain", value: "a.com" });
    const b = await tools.maltego_add_entity({ graphId, type: "IPv4Address", value: "1.2.3.4" });
    const l = await tools.maltego_add_link({ graphId, from: a.entityId, to: b.entityId, label: "resolves" });
    expect(l.linkId).toMatch(/^l-/);
    const g = reg.getOrThrow(graphId);
    expect(g.entityCount()).toBe(2);
    expect(g.linkCount()).toBe(1);
  });

  it("maltego_save_graph writes a .mtgx file and refuses overwrite", async () => {
    const tools = graphToolHandlers(reg, { outputDir: tmp });
    const { graphId } = await tools.maltego_create_graph({ name: "s" });
    await tools.maltego_add_entity({ graphId, type: "Domain", value: "a.com" });
    const path = join(tmp, "out.mtgx");
    const saved = await tools.maltego_save_graph({ graphId, path });
    expect(saved.path).toBe(path);
    const bytes = await readFile(path);
    expect(bytes.byteLength).toBeGreaterThan(0);

    await expect(tools.maltego_save_graph({ graphId, path })).rejects.toThrow(/exists/);
    await tools.maltego_save_graph({ graphId, path, overwrite: true });
    await rm(tmp, { recursive: true, force: true });
  });

  it("maltego_load_graph parses a saved .mtgx into a new handle", async () => {
    const tools = graphToolHandlers(reg, { outputDir: tmp });
    const { graphId } = await tools.maltego_create_graph({ name: "l" });
    const a = await tools.maltego_add_entity({ graphId, type: "Domain", value: "a.com" });
    const b = await tools.maltego_add_entity({ graphId, type: "IPv4Address", value: "1.2.3.4" });
    await tools.maltego_add_link({ graphId, from: a.entityId, to: b.entityId, label: "r" });
    const path = join(tmp, "rt.mtgx");
    await tools.maltego_save_graph({ graphId, path });

    const loaded = await tools.maltego_load_graph({ path });
    expect(loaded.graphId).not.toBe(graphId);
    expect(loaded.entityCount).toBe(2);
    expect(loaded.linkCount).toBe(1);
    await rm(tmp, { recursive: true, force: true });
  });

  it("maltego_add_entity throws on unknown type", async () => {
    const tools = graphToolHandlers(reg, { outputDir: tmp });
    const { graphId } = await tools.maltego_create_graph({ name: "e" });
    await expect(
      tools.maltego_add_entity({ graphId, type: "NotARealType", value: "x" })
    ).rejects.toThrow(/Unknown entity type/);
  });

  it("maltego_save_graph refuses paths outside the configured output directory", async () => {
    const tools = graphToolHandlers(reg, { outputDir: tmp });
    const { graphId } = await tools.maltego_create_graph({ name: "escape" });
    await tools.maltego_add_entity({ graphId, type: "Domain", value: "a.com" });
    // Attempt to escape via absolute path outside tmp
    const outsideAbs = resolve(tmp, "..", "escapes.mtgx");
    await expect(
      tools.maltego_save_graph({ graphId, path: outsideAbs })
    ).rejects.toThrow(/outside the configured output directory/);
    // Attempt to escape via traversal
    await expect(
      tools.maltego_save_graph({ graphId, path: "../escapes.mtgx" })
    ).rejects.toThrow(/outside the configured output directory/);
  });
});
