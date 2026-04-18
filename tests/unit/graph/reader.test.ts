import { describe, it, expect } from "vitest";
import { Graph } from "../../../src/graph/graph.js";
import { writeMtgxBytes } from "../../../src/graph/writer.js";
import { readMtgxBytes } from "../../../src/graph/reader.js";

describe("readMtgxBytes", () => {
  it("round-trips a simple graph", async () => {
    const original = new Graph("g-1", "rt");
    const a = original.addEntity({ type: "Domain", value: "a.com", properties: {} });
    const b = original.addEntity({ type: "IPv4Address", value: "1.2.3.4", properties: {} });
    original.addLink({ from: a.id, to: b.id, label: "resolves", properties: {} });

    const bytes = await writeMtgxBytes(original);
    const restored = await readMtgxBytes(bytes, "g-2");

    expect(restored.entityCount()).toBe(2);
    expect(restored.linkCount()).toBe(1);
    const values = restored.allEntities().map((e) => e.value).sort();
    expect(values).toEqual(["1.2.3.4", "a.com"]);
  });

  it("throws on malformed zip", async () => {
    const bad = new Uint8Array([0x00, 0x01, 0x02]);
    await expect(readMtgxBytes(bad, "g-x")).rejects.toThrow(/parse|zip/i);
  });

  it("throws when Graphs/Graph1.graphml is missing", async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file("unrelated.txt", "hi");
    const bytes = await zip.generateAsync({ type: "uint8array" });
    await expect(readMtgxBytes(bytes, "g-x")).rejects.toThrow(/Graph1\.graphml/);
  });

  it("preserves entity positions across round-trip", async () => {
    const original = new Graph("g-1", "rt");
    const a = original.addEntity({ type: "Domain", value: "a.com", properties: {}, position: { x: 100, y: 200 } });
    const b = original.addEntity({ type: "IPv4Address", value: "1.2.3.4", properties: {}, position: { x: 340, y: 50 } });
    original.addLink({ from: a.id, to: b.id, label: "resolves", properties: {} });

    const bytes = await writeMtgxBytes(original);
    const restored = await readMtgxBytes(bytes, "g-2");

    const aRestored = restored.allEntities().find((e) => e.value === "a.com");
    const bRestored = restored.allEntities().find((e) => e.value === "1.2.3.4");
    expect(aRestored?.position).toEqual({ x: 100, y: 200 });
    expect(bRestored?.position).toEqual({ x: 340, y: 50 });
  });
});
