export type EntityId = string;
export type LinkId = string;
export type GraphId = string;

export interface Position {
  x: number;
  y: number;
}

export interface Entity {
  id: EntityId;
  type: string;
  value: string;
  properties: Record<string, string>;
  position?: Position;
}

export interface Link {
  id: LinkId;
  from: EntityId;
  to: EntityId;
  label?: string;
  properties: Record<string, string>;
}

export interface GraphSnapshot {
  id: GraphId;
  name: string;
  entities: Entity[];
  links: Link[];
}

export interface LookupResult<T> {
  ok: true;
  data: T;
}

export interface LookupError {
  ok: false;
  error: string;
  retriable: boolean;
  retryAfterMs?: number;
}

export type LookupOutcome<T> = LookupResult<T> | LookupError;
