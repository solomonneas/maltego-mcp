import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { GraphRegistry } from "../../src/server/registry.js";
import { graphToolHandlers } from "../../src/tools/graph.js";

describe("integration: canonical round-trip", () => {
  let reg: GraphRegistry;
  let tools: ReturnType<typeof graphToolHandlers>;
  let tmp: string;

  beforeEach(async () => {
    reg = new GraphRegistry();
    tools = graphToolHandlers(reg);
    tmp = await mkdtemp(join(tmpdir(), "maltego-mcp-int-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("create -> 5 entities -> 4 links -> save -> load -> shape matches", async () => {
    const { graphId } = await tools.maltego_create_graph({ name: "round-trip" });

    const a = await tools.maltego_add_entity({ graphId, type: "Domain", value: "evil.example" });
    const b = await tools.maltego_add_entity({ graphId, type: "IPv4Address", value: "9.9.9.9" });
    const c = await tools.maltego_add_entity({ graphId, type: "EmailAddress", value: "root@evil.example" });
    const d = await tools.maltego_add_entity({ graphId, type: "Hash", value: "d41d8cd98f00b204e9800998ecf8427e", properties: { algorithm: "md5" } });
    const e = await tools.maltego_add_entity({ graphId, type: "Phrase", value: "[T1566] Phishing" });

    await tools.maltego_add_link({ graphId, from: a.entityId, to: b.entityId, label: "resolves" });
    await tools.maltego_add_link({ graphId, from: a.entityId, to: c.entityId, label: "hosts" });
    await tools.maltego_add_link({ graphId, from: c.entityId, to: d.entityId, label: "dropped" });
    await tools.maltego_add_link({ graphId, from: d.entityId, to: e.entityId, label: "uses technique" });

    const outPath = join(tmp, "rt.mtgx");
    const saved = await tools.maltego_save_graph({ graphId, path: outPath });
    expect(saved.entityCount).toBe(5);
    expect(saved.linkCount).toBe(4);

    const loaded = await tools.maltego_load_graph({ path: outPath });
    expect(loaded.entityCount).toBe(5);
    expect(loaded.linkCount).toBe(4);

    const loadedGraph = reg.getOrThrow(loaded.graphId);
    const values = loadedGraph.allEntities().map((x) => x.value).sort();
    expect(values).toEqual([
      "9.9.9.9",
      "[T1566] Phishing",
      "d41d8cd98f00b204e9800998ecf8427e",
      "evil.example",
      "root@evil.example"
    ]);
  });
});
