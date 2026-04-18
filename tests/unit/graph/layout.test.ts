import { describe, it, expect } from "vitest";
import { Graph } from "../../../src/graph/graph.js";

describe("Graph.applyLayout (grid-by-type)", () => {
  it("assigns positions to every entity", () => {
    const g = new Graph("g-1", "t");
    const a = g.addEntity({ type: "Domain", value: "a.com", properties: {} });
    const b = g.addEntity({ type: "IPv4Address", value: "1.2.3.4", properties: {} });
    g.applyLayout();
    expect(g.getEntity(a.id)?.position).toBeDefined();
    expect(g.getEntity(b.id)?.position).toBeDefined();
  });

  it("places entities of different types in separate columns", () => {
    const g = new Graph("g-1", "t");
    const a = g.addEntity({ type: "Domain", value: "a.com", properties: {} });
    const b = g.addEntity({ type: "IPv4Address", value: "1.2.3.4", properties: {} });
    g.applyLayout();
    expect(g.getEntity(a.id)!.position!.x).not.toBe(g.getEntity(b.id)!.position!.x);
  });

  it("stacks entities of the same type vertically", () => {
    const g = new Graph("g-1", "t");
    const a = g.addEntity({ type: "Domain", value: "a.com", properties: {} });
    const b = g.addEntity({ type: "Domain", value: "b.com", properties: {} });
    g.applyLayout();
    expect(g.getEntity(a.id)!.position!.x).toBe(g.getEntity(b.id)!.position!.x);
    expect(g.getEntity(a.id)!.position!.y).not.toBe(g.getEntity(b.id)!.position!.y);
  });
});
