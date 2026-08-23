import type { Entity, EntityId, GraphId, GraphSnapshot, Link, LinkId, Position } from "../types.js";
import { normalizeEntityType } from "./entities.js";

export interface AddEntityInput {
  type: string;
  value: string;
  properties?: Record<string, string>;
  position?: Position;
}

export interface AddLinkInput {
  from: EntityId;
  to: EntityId;
  label?: string;
  properties?: Record<string, string>;
}

export interface GraphLimits {
  maxEntities?: number;
  maxLinks?: number;
  maxProperties?: number;
  maxStringLength?: number;
}

const DEFAULT_LIMITS: Required<GraphLimits> = {
  maxEntities: 10_000,
  maxLinks: 20_000,
  maxProperties: 100,
  maxStringLength: 8_192,
};

export class Graph {
  readonly id: GraphId;
  name: string;
  private entities = new Map<EntityId, Entity>();
  private links = new Map<LinkId, Link>();
  private entityKey = new Set<string>();
  private nextEntityNum = 1;
  private nextLinkNum = 1;
  private readonly limits: Required<GraphLimits>;

  constructor(id: GraphId, name: string, limits: GraphLimits = {}) {
    this.id = id;
    this.name = name;
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }

  private validateStrings(values: Array<string | undefined>, properties: Record<string, string> | undefined): void {
    if (values.some((value) => (value?.length ?? 0) > this.limits.maxStringLength)) throw new Error("resource limit: string too long");
    const entries = Object.entries(properties ?? {});
    if (entries.length > this.limits.maxProperties) throw new Error("resource limit: too many properties");
    if (entries.some(([key, value]) => key.length > this.limits.maxStringLength || value.length > this.limits.maxStringLength)) throw new Error("resource limit: property string too long");
  }

  addEntity(input: AddEntityInput): Entity {
    if (this.entities.size >= this.limits.maxEntities) throw new Error("resource limit: maximum entities reached");
    this.validateStrings([input.type, input.value], input.properties);
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
      position: input.position
    };
    this.entities.set(id, entity);
    this.entityKey.add(key);
    return entity;
  }

  ensureEntity(input: AddEntityInput): Entity {
    const type = normalizeEntityType(input.type);
    const key = `${type}::${input.value}`;
    if (this.entityKey.has(key)) {
      for (const entity of this.entities.values()) {
        if (entity.type === type && entity.value === input.value) {
          return entity;
        }
      }
    }
    return this.addEntity(input);
  }

  addLink(input: AddLinkInput): Link {
    if (this.links.size >= this.limits.maxLinks) throw new Error("resource limit: maximum links reached");
    this.validateStrings([input.label], input.properties);
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

  applyLayout(): void {
    const columnSpacing = 240;
    const rowSpacing = 140;
    const columnByType = new Map<string, number>();
    const rowByType = new Map<string, number>();
    for (const entity of this.entities.values()) {
      if (entity.position) continue;
      let col = columnByType.get(entity.type);
      if (col === undefined) {
        col = columnByType.size;
        columnByType.set(entity.type, col);
      }
      const row = rowByType.get(entity.type) ?? 0;
      rowByType.set(entity.type, row + 1);
      entity.position = {
        x: col * columnSpacing,
        y: row * rowSpacing
      };
    }
  }
}
