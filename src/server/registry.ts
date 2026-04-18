import type { GraphId } from "../types.js";
import { Graph } from "../graph/graph.js";
import { randomUUID } from "node:crypto";

export class GraphRegistry {
  private map = new Map<GraphId, Graph>();

  create(name: string): Graph {
    const id = `g-${randomUUID().slice(0, 8)}`;
    const g = new Graph(id, name);
    this.map.set(id, g);
    return g;
  }

  register(graph: Graph): void {
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
}
