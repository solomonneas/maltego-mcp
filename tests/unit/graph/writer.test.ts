import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { Graph } from "../../../src/graph/graph.js";
import { writeMtgxBytes } from "../../../src/graph/writer.js";

describe("writeMtgxBytes", () => {
  it("produces a zip containing Graphs/Graph1.graphml", async () => {
    const g = new Graph("g-1", "t");
    g.addEntity({ type: "Domain", value: "a.com", properties: {} });
    const bytes = await writeMtgxBytes(g);
    const zip = await JSZip.loadAsync(bytes);
    expect(zip.file("Graphs/Graph1.graphml")).not.toBeNull();
  });

  it("embeds one <node> per entity", async () => {
    const g = new Graph("g-1", "t");
    g.addEntity({ type: "Domain", value: "a.com", properties: {} });
    g.addEntity({ type: "IPv4Address", value: "1.2.3.4", properties: {} });
    const bytes = await writeMtgxBytes(g);
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file("Graphs/Graph1.graphml")!.async("string");
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
    const parsed = parser.parse(xml);
    const nodes = parsed.graphml.graph.node;
    const nodeArray = Array.isArray(nodes) ? nodes : [nodes];
    expect(nodeArray).toHaveLength(2);
  });

  it("embeds one <edge> per link with correct endpoints", async () => {
    const g = new Graph("g-1", "t");
    const a = g.addEntity({ type: "Domain", value: "a.com", properties: {} });
    const b = g.addEntity({ type: "IPv4Address", value: "1.2.3.4", properties: {} });
    g.addLink({ from: a.id, to: b.id, label: "resolves", properties: {} });
    const bytes = await writeMtgxBytes(g);
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file("Graphs/Graph1.graphml")!.async("string");
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
    const parsed = parser.parse(xml);
    const edges = parsed.graphml.graph.edge;
    const edgeArray = Array.isArray(edges) ? edges : [edges];
    expect(edgeArray).toHaveLength(1);
    expect(edgeArray[0]["@_source"]).toBe(a.id);
    expect(edgeArray[0]["@_target"]).toBe(b.id);
  });

  it("applies layout if entities lack positions", async () => {
    const g = new Graph("g-1", "t");
    g.addEntity({ type: "Domain", value: "a.com", properties: {} });
    const bytes = await writeMtgxBytes(g);
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(g.allEntities()[0].position).toBeDefined();
  });
});
