import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { GraphRegistry } from "../../src/server/registry.js";
import { graphToolHandlers } from "../../src/tools/graph.js";

describe("integration: error propagation", () => {
  let reg: GraphRegistry;
  let tools: ReturnType<typeof graphToolHandlers>;
  let tmp: string;

  beforeEach(async () => {
    reg = new GraphRegistry();
    tmp = await mkdtemp(join(tmpdir(), "maltego-err-int-"));
    tools = graphToolHandlers(reg, { outputDir: tmp });
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("refuses to overwrite without flag, succeeds with flag", async () => {
    const { graphId } = await tools.maltego_create_graph({ name: "x" });
    await tools.maltego_add_entity({ graphId, type: "Domain", value: "a.com" });
    const out = join(tmp, "x.mtgx");
    await tools.maltego_save_graph({ graphId, path: out });
    await expect(tools.maltego_save_graph({ graphId, path: out })).rejects.toThrow(/exists/);
    await tools.maltego_save_graph({ graphId, path: out, overwrite: true });
  });

  it("throws parse error on malformed .mtgx", async () => {
    const bad = join(tmp, "bad.mtgx");
    await writeFile(bad, Buffer.from([0x00, 0x01, 0x02]));
    await expect(tools.maltego_load_graph({ path: bad })).rejects.toThrow(/parse|zip/i);
  });

  it("throws validation error with suggestions on unknown entity type", async () => {
    const { graphId } = await tools.maltego_create_graph({ name: "y" });
    await expect(
      tools.maltego_add_entity({ graphId, type: "IPv4", value: "1.2.3.4" })
    ).rejects.toThrow(/Unknown entity type/);
  });
});
