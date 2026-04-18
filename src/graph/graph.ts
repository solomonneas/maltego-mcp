import type { Entity, EntityId, GraphId, GraphSnapshot, Link, LinkId, Position } from "../types.js";
import { normalizeEntityType } from "./entities.js";

export interface AddEntityInput {
  type: string;
  value: string;
  properties?: Record<string, string>;
  position?: Position;
  notes?: string;
}

export interface AddLinkInput {
  from: EntityId;
  to: EntityId;
  label?: string;
  properties?: Record<string, string>;
}

export class Graph {
  readonly id: GraphId;
  name: string;
  private entities = new Map<EntityId, Entity>();
  private links = new Map<LinkId, Link>();
  private entityKey = new Set<string>();
  private nextEntityNum = 1;
  private nextLinkNum = 1;

  constructor(id: GraphId, name: string) {
    this.id = id;
    this.name = name;
  }

  addEntity(input: AddEntityInput): Entity {
    const type = normalizeEntityType(input.type);
    const key = `${type}::${input.value}`;
    if (this.entityKey.has(key)) {
      throw new Error(`duplicate entity: ${type} '${input.value}' already in graph`);
    }
    const id: EntityId = `e-${this.nextEntityNum++}`;
    const entity: Entity = {
      id,
      type,
      value: input.value,
      properties: input.properties ?? {},
      position: input.position,
      notes: input.notes
    };
    this.entities.set(id, entity);
    this.entityKey.add(key);
    return entity;
  }

  addLink(input: AddLinkInput): Link {
    if (!this.entities.has(input.from)) {
      throw new Error(`unknown entity on link.from: ${input.from}`);
    }
    if (!this.entities.has(input.to)) {
      throw new Error(`unknown entity on link.to: ${input.to}`);
    }
    const id: LinkId = `l-${this.nextLinkNum++}`;
    const link: Link = {
      id,
      from: input.from,
      to: input.to,
      label: input.label,
      properties: input.properties ?? {}
    };
    this.links.set(id, link);
    return link;
  }

  entityCount(): number {
    return this.entities.size;
  }

  linkCount(): number {
    return this.links.size;
  }

  getEntity(id: EntityId): Entity | undefined {
    return this.entities.get(id);
  }

  allEntities(): Entity[] {
    return [...this.entities.values()];
  }

  allLinks(): Link[] {
    return [...this.links.values()];
  }

  snapshot(): GraphSnapshot {
    return {
      id: this.id,
      name: this.name,
      entities: this.allEntities(),
      links: this.allLinks()
    };
  }
}
