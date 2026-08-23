import type { GraphId } from "../types.js";
import { Graph } from "../graph/graph.js";
import { randomUUID } from "node:crypto";

export class GraphRegistry {
  private map = new Map<GraphId, Graph>();
  private readonly maxGraphs: number;

  constructor({ maxGraphs = 100 }: { maxGraphs?: number } = {}) {
    this.maxGraphs = maxGraphs;
  }

  private assertCapacity(id: GraphId): void {
    if (this.map.has(id)) throw new Error(`graphId collision: ${id}`);
    if (this.map.size >= this.maxGraphs) throw new Error("resource limit: maximum graphs reached");
  }

  create(name: string): Graph {
    this.assertCapacity("new");
    const id = `g-${randomUUID()}`;
    const g = new Graph(id, name);
    this.map.set(id, g);
    return g;
  }

  register(graph: Graph): void {
    this.assertCapacity(graph.id);
    this.map.set(graph.id, graph);
  }

  get(id: GraphId): Graph | undefined {
    return this.map.get(id);
  }

  getOrThrow(id: GraphId): Graph {
    const g = this.map.get(id);
    if (!g) {
      throw new Error(`unknown graphId: ${id}`);
    }
    return g;
  }

  allIds(): GraphId[] {
    return [...this.map.keys()];
  }

  dispose(id: GraphId): boolean { return this.map.delete(id); }
}
