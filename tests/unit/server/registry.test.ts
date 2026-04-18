import { describe, it, expect, beforeEach } from "vitest";
import { GraphRegistry } from "../../../src/server/registry.js";
import { Graph } from "../../../src/graph/graph.js";

describe("GraphRegistry", () => {
  let reg: GraphRegistry;
  beforeEach(() => {
    reg = new GraphRegistry();
  });

  it("creates graphs with unique ids", () => {
    const a = reg.create("one");
    const b = reg.create("two");
    expect(a.id).not.toBe(b.id);
  });

  it("fetches graphs by id", () => {
    const g = reg.create("x");
    expect(reg.get(g.id)).toBe(g);
  });

  it("throws when fetching unknown id", () => {
    expect(() => reg.getOrThrow("g-bogus")).toThrow(/unknown graphId/);
  });

  it("registers an externally created graph", () => {
    const g = new Graph("g-imported", "imp");
    reg.register(g);
    expect(reg.get("g-imported")).toBe(g);
  });
});
