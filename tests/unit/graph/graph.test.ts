import { describe, it, expect } from "vitest";
import { Graph } from "../../../src/graph/graph.js";

describe("Graph", () => {
  it("creates empty graph with name", () => {
    const g = new Graph("g-1", "test-graph");
    expect(g.id).toBe("g-1");
    expect(g.name).toBe("test-graph");
    expect(g.entityCount()).toBe(0);
    expect(g.linkCount()).toBe(0);
  });

  it("adds entities and assigns sequential IDs", () => {
    const g = new Graph("g-1", "test");
    const a = g.addEntity({ type: "Domain", value: "a.com", properties: {} });
    const b = g.addEntity({ type: "Domain", value: "b.com", properties: {} });
    expect(a.id).not.toBe(b.id);
    expect(g.entityCount()).toBe(2);
  });

  it("normalizes bare entity types to maltego.*", () => {
    const g = new Graph("g-1", "test");
    const e = g.addEntity({ type: "Domain", value: "a.com", properties: {} });
    expect(e.type).toBe("maltego.Domain");
  });

  it("throws on unknown entity type", () => {
    const g = new Graph("g-1", "test");
    expect(() => g.addEntity({ type: "BogusType", value: "x", properties: {} }))
      .toThrow(/Unknown entity type/);
  });

  it("adds links between existing entities", () => {
    const g = new Graph("g-1", "test");
    const a = g.addEntity({ type: "Domain", value: "a.com", properties: {} });
    const b = g.addEntity({ type: "IPv4Address", value: "1.2.3.4", properties: {} });
    const link = g.addLink({ from: a.id, to: b.id, label: "resolves to", properties: {} });
    expect(link.from).toBe(a.id);
    expect(link.to).toBe(b.id);
    expect(g.linkCount()).toBe(1);
  });

  it("rejects orphan links", () => {
    const g = new Graph("g-1", "test");
    const a = g.addEntity({ type: "Domain", value: "a.com", properties: {} });
    expect(() => g.addLink({ from: a.id, to: "e-missing", label: "x", properties: {} }))
      .toThrow(/unknown entity/);
  });

  it("rejects duplicate entity values of the same type", () => {
    const g = new Graph("g-1", "test");
    g.addEntity({ type: "Domain", value: "a.com", properties: {} });
    expect(() => g.addEntity({ type: "Domain", value: "a.com", properties: {} }))
      .toThrow(/duplicate/);
  });

  it("allows same value across different types", () => {
    const g = new Graph("g-1", "test");
    g.addEntity({ type: "Domain", value: "example", properties: {} });
    g.addEntity({ type: "Phrase", value: "example", properties: {} });
    expect(g.entityCount()).toBe(2);
  });

  it("returns a snapshot matching the stored state", () => {
    const g = new Graph("g-1", "test");
    const a = g.addEntity({ type: "Domain", value: "a.com", properties: {} });
    const b = g.addEntity({ type: "IPv4Address", value: "1.2.3.4", properties: {} });
    g.addLink({ from: a.id, to: b.id, label: "resolves", properties: {} });
    const snap = g.snapshot();
    expect(snap.id).toBe("g-1");
    expect(snap.entities).toHaveLength(2);
    expect(snap.links).toHaveLength(1);
  });
});
