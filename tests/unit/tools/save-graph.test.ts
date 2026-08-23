import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { GraphRegistry } from "../../../src/server/registry.js";
import { createSaveGraphTool } from "../../../src/tools/save-graph.js";
import { resolveConfig } from "../../../src/config.js";

describe("save-graph tool", () => {
  let registry: GraphRegistry;
  let tmp: string;
  beforeEach(async () => {
    registry = new GraphRegistry();
    tmp = await mkdtemp(join(tmpdir(), "maltego-mcp-test-"));
  });
  afterEach(async () => { await rm(tmp, { recursive: true, force: true }); });

  it("writes a .mtgx and refuses overwrite", async () => {
    const tool = createSaveGraphTool({ registry, config: resolveConfig({ pluginConfig: { outputDir: tmp } }) });
    const g = registry.create("s");
    g.addEntity({ type: "Domain", value: "a.com", properties: {} });
    const path = join(tmp, "out.mtgx");
    const saved = await tool.execute("t", { graphId: g.id, path });
    expect(saved.details.path).toBe(path);
    const bytes = await readFile(path);
    expect(bytes.byteLength).toBeGreaterThan(0);
    await expect(tool.execute("t", { graphId: g.id, path })).rejects.toThrow(/exists/);
    await tool.execute("t", { graphId: g.id, path, overwrite: true });
  });

  it("refuses paths outside outputDir", async () => {
    const tool = createSaveGraphTool({ registry, config: resolveConfig({ pluginConfig: { outputDir: tmp } }) });
    const g = registry.create("escape");
    g.addEntity({ type: "Domain", value: "a.com", properties: {} });
    const outside = resolve(tmp, "..", "escapes.mtgx");
    await expect(tool.execute("t", { graphId: g.id, path: outside })).rejects.toThrow(/outside the configured output directory/);
  });

  it("rejects a symlinked child path without changing its target", async () => {
    const outside = await mkdtemp(join(tmpdir(), "maltego-mcp-outside-"));
    await symlink(outside, join(tmp, "link"));
    const target = join(outside, "test.mtgx");
    await writeFile(target, "unchanged");
    const tool = createSaveGraphTool({ registry, config: resolveConfig({ pluginConfig: { outputDir: tmp } }) });
    const g = registry.create("symlink");
    g.addEntity({ type: "Domain", value: "a.com", properties: {} });
    await expect(tool.execute("t", { graphId: g.id, path: "link/test.mtgx", overwrite: true })).rejects.toThrow(/symlink/i);
    await expect(readFile(target, "utf8")).resolves.toBe("unchanged");
    await rm(outside, { recursive: true, force: true });
  });
});
