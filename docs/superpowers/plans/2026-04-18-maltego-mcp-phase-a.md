# maltego-mcp Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript MCP server that lets Claude author Maltego `.mtgx` graph files and run primitive infrastructure lookups (whois / DNS / ASN / crt.sh).

**Architecture:** Node 20+ stdio MCP server. Pure graph library (`src/graph/`) with no MCP knowledge, pure async lookup functions (`src/lookups/`) with no graph knowledge, and an MCP tools layer (`src/tools/`) that composes the two. Matches `solomonneas/misp-mcp` conventions for layout, build, test framework, tool naming, and error shape.

**Tech Stack:** TypeScript, Node 20+, `@modelcontextprotocol/sdk`, `jszip`, `fast-xml-parser`, `whois`, Node built-in `dns/promises`, `undici` (HTTP + MockAgent for tests), `vitest`, `tsup`.

**Reference spec:** `docs/superpowers/specs/2026-04-18-maltego-mcp-design.md`

---

## Task 1: Scaffold repo

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsup.config.ts`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `src/index.ts` (placeholder)
- Create: `README.md` (placeholder, filled in Task 21)

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "maltego-mcp",
  "version": "0.1.0",
  "description": "MCP server for authoring Maltego graph files and running primitive OSINT lookups.",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "maltego-mcp": "dist/index.js"
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:all": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "jszip": "^3.10.1",
    "fast-xml-parser": "^4.3.0",
    "whois": "^2.14.0",
    "undici": "^6.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/whois": "^2.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.3.0",
    "vitest": "^1.0.0"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": false,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create `tsup.config.ts`**

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  clean: true,
  minify: false,
  sourcemap: true,
  banner: { js: "#!/usr/bin/env node" }
});
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 10_000
  }
});
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules/
dist/
*.log
.env
.env.local
coverage/
.vitest-cache/
```

- [ ] **Step 6: Create placeholder `src/index.ts`**

```ts
// MCP server entry. Wired up in Task 18.
console.error("maltego-mcp: server entry not implemented yet");
process.exit(1);
```

- [ ] **Step 7: Create placeholder `README.md`**

```markdown
# maltego-mcp

MCP server for authoring Maltego graphs. See `docs/superpowers/specs/2026-04-18-maltego-mcp-design.md`.

Installation and usage: filled in Task 21.
```

- [ ] **Step 8: Install dependencies**

Run: `cd ~/repos/maltego-mcp && npm install`
Expected: `node_modules/` populated, `package-lock.json` created, no errors.

- [ ] **Step 9: Verify build and typecheck**

Run: `npm run build && npm run typecheck`
Expected: `dist/index.js` created, typecheck passes with no errors.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsup.config.ts vitest.config.ts .gitignore src/index.ts README.md
git commit -m "chore: scaffold TypeScript MCP project"
```

---

## Task 2: Define core types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Create `src/types.ts`**

```ts
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
  notes?: string;
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
```

- [ ] **Step 2: Verify types compile**

Run: `npm run typecheck`
Expected: PASS with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): core Entity, Link, Graph, Lookup types"
```

---

## Task 3: Entity type registry with validation

**Files:**
- Create: `src/graph/entities.ts`
- Create: `tests/unit/graph/entities.test.ts`

- [ ] **Step 1: Write failing test**

`tests/unit/graph/entities.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { validateEntityType, ENTITY_TYPES, isPhraseType } from "../../../src/graph/entities.js";

describe("validateEntityType", () => {
  it("accepts standard Maltego types", () => {
    expect(validateEntityType("maltego.IPv4Address")).toEqual({ ok: true });
    expect(validateEntityType("maltego.Domain")).toEqual({ ok: true });
    expect(validateEntityType("maltego.Phrase")).toEqual({ ok: true });
  });

  it("accepts bare type names (auto-prefixed)", () => {
    expect(validateEntityType("IPv4Address")).toEqual({ ok: true, normalized: "maltego.IPv4Address" });
    expect(validateEntityType("Domain")).toEqual({ ok: true, normalized: "maltego.Domain" });
  });

  it("rejects unknown types with suggestions", () => {
    const result = validateEntityType("IPv4");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.suggestions).toContain("maltego.IPv4Address");
    }
  });

  it("registry includes expected types", () => {
    expect(ENTITY_TYPES).toContain("maltego.IPv4Address");
    expect(ENTITY_TYPES).toContain("maltego.IPv6Address");
    expect(ENTITY_TYPES).toContain("maltego.Domain");
    expect(ENTITY_TYPES).toContain("maltego.URL");
    expect(ENTITY_TYPES).toContain("maltego.Hash");
    expect(ENTITY_TYPES).toContain("maltego.EmailAddress");
    expect(ENTITY_TYPES).toContain("maltego.Netblock");
    expect(ENTITY_TYPES).toContain("maltego.AS");
    expect(ENTITY_TYPES).toContain("maltego.Website");
    expect(ENTITY_TYPES).toContain("maltego.Company");
    expect(ENTITY_TYPES).toContain("maltego.Person");
    expect(ENTITY_TYPES).toContain("maltego.Phrase");
  });
});

describe("isPhraseType", () => {
  it("identifies phrase type variants", () => {
    expect(isPhraseType("maltego.Phrase")).toBe(true);
    expect(isPhraseType("Phrase")).toBe(true);
    expect(isPhraseType("maltego.Domain")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test -- tests/unit/graph/entities.test.ts`
Expected: FAIL with module-not-found for `src/graph/entities.js`.

- [ ] **Step 3: Implement `src/graph/entities.ts`**

```ts
export const ENTITY_TYPES = [
  "maltego.IPv4Address",
  "maltego.IPv6Address",
  "maltego.Domain",
  "maltego.URL",
  "maltego.Hash",
  "maltego.EmailAddress",
  "maltego.Netblock",
  "maltego.AS",
  "maltego.Website",
  "maltego.Company",
  "maltego.Person",
  "maltego.Phrase"
] as const;

export type MaltegoEntityType = (typeof ENTITY_TYPES)[number];

export type ValidateResult =
  | { ok: true; normalized?: string }
  | { ok: false; suggestions: string[]; message: string };

export function validateEntityType(type: string): ValidateResult {
  if ((ENTITY_TYPES as readonly string[]).includes(type)) {
    return { ok: true };
  }
  const prefixed = `maltego.${type}`;
  if ((ENTITY_TYPES as readonly string[]).includes(prefixed)) {
    return { ok: true, normalized: prefixed };
  }
  const suggestions = ENTITY_TYPES.filter(
    (t) => t.toLowerCase().includes(type.toLowerCase())
  );
  return {
    ok: false,
    suggestions: suggestions.length > 0 ? [...suggestions] : [...ENTITY_TYPES],
    message: `Unknown entity type '${type}'. Valid types: ${ENTITY_TYPES.join(", ")}`
  };
}

export function isPhraseType(type: string): boolean {
  return type === "maltego.Phrase" || type === "Phrase";
}

export function normalizeEntityType(type: string): string {
  const result = validateEntityType(type);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.normalized ?? type;
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test -- tests/unit/graph/entities.test.ts`
Expected: PASS, all cases green.

- [ ] **Step 5: Commit**

```bash
git add src/graph/entities.ts tests/unit/graph/entities.test.ts
git commit -m "feat(graph): entity type registry with validation and suggestions"
```

---

## Task 4: In-memory Graph class

**Files:**
- Create: `src/graph/graph.ts`
- Create: `tests/unit/graph/graph.test.ts`

- [ ] **Step 1: Write failing test**

`tests/unit/graph/graph.test.ts`:
```ts
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
```

- [ ] **Step 2: Run, verify it fails**

Run: `npm test -- tests/unit/graph/graph.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/graph/graph.ts`**

```ts
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
```

- [ ] **Step 4: Run, verify it passes**

Run: `npm test -- tests/unit/graph/graph.test.ts`
Expected: PASS all cases.

- [ ] **Step 5: Commit**

```bash
git add src/graph/graph.ts tests/unit/graph/graph.test.ts
git commit -m "feat(graph): in-memory Graph with entity/link mutations and validation"
```

---

## Task 5: Auto-layout for entity positions

**Files:**
- Modify: `src/graph/graph.ts` (add `applyLayout` method)
- Create: `tests/unit/graph/layout.test.ts`

- [ ] **Step 1: Write failing test**

`tests/unit/graph/layout.test.ts`:
```ts
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
```

- [ ] **Step 2: Run, verify it fails**

Run: `npm test -- tests/unit/graph/layout.test.ts`
Expected: FAIL on `applyLayout is not a function`.

- [ ] **Step 3: Add `applyLayout` to `src/graph/graph.ts`**

Append to the `Graph` class:

```ts
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
```

- [ ] **Step 4: Run, verify it passes**

Run: `npm test -- tests/unit/graph/layout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/graph/graph.ts tests/unit/graph/layout.test.ts
git commit -m "feat(graph): grid-by-type auto-layout for entity positions"
```

---

## Task 6: GraphML writer and .mtgx packaging (structural)

**Files:**
- Create: `src/graph/writer.ts`
- Create: `tests/unit/graph/writer.test.ts`

- [ ] **Step 1: Write failing test**

`tests/unit/graph/writer.test.ts`:
```ts
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
```

- [ ] **Step 2: Run, verify it fails**

Run: `npm test -- tests/unit/graph/writer.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/graph/writer.ts`**

```ts
import JSZip from "jszip";
import { XMLBuilder } from "fast-xml-parser";
import type { Graph } from "./graph.js";
import type { Entity, Link } from "../types.js";

function entityToNode(entity: Entity) {
  const props: unknown[] = [
    {
      "@_name": "properties.value",
      "@_displayName": "Value",
      "@_type": "string",
      "@_nullable": "true",
      "@_hidden": "false",
      "@_readonly": "false",
      "mtg:Value": entity.value
    }
  ];
  for (const [k, v] of Object.entries(entity.properties)) {
    props.push({
      "@_name": k,
      "@_displayName": k,
      "@_type": "string",
      "@_nullable": "true",
      "@_hidden": "false",
      "@_readonly": "false",
      "mtg:Value": v
    });
  }
  return {
    "@_id": entity.id,
    "data": [
      {
        "@_key": "d0",
        "mtg:MaltegoEntity": {
          "@_xmlns:mtg": "http://maltego.paterva.com/xml/mtgx",
          "@_type": entity.type,
          "mtg:Properties": { "mtg:Property": props }
        }
      },
      {
        "@_key": "d1",
        "y:ShapeNode": {
          "@_xmlns:y": "http://www.yworks.com/xml/graphml",
          "y:Geometry": {
            "@_x": entity.position?.x ?? 0,
            "@_y": entity.position?.y ?? 0,
            "@_width": 80,
            "@_height": 80
          }
        }
      }
    ]
  };
}

function linkToEdge(link: Link) {
  const props: unknown[] = [];
  if (link.label) {
    props.push({
      "@_name": "maltego.link.label",
      "@_displayName": "Label",
      "@_type": "string",
      "mtg:Value": link.label
    });
  }
  for (const [k, v] of Object.entries(link.properties)) {
    props.push({
      "@_name": k,
      "@_displayName": k,
      "@_type": "string",
      "mtg:Value": v
    });
  }
  return {
    "@_id": link.id,
    "@_source": link.from,
    "@_target": link.to,
    "data": {
      "@_key": "d2",
      "mtg:MaltegoLink": {
        "@_xmlns:mtg": "http://maltego.paterva.com/xml/mtgx",
        "mtg:Properties": props.length > 0 ? { "mtg:Property": props } : ""
      }
    }
  };
}

export async function writeMtgxBytes(graph: Graph): Promise<Uint8Array> {
  graph.applyLayout();
  const entities = graph.allEntities();
  const links = graph.allLinks();

  const doc = {
    "?xml": { "@_version": "1.0", "@_encoding": "UTF-8" },
    graphml: {
      "@_xmlns": "http://graphml.graphdrawing.org/xmlns",
      "@_xmlns:mtg": "http://maltego.paterva.com/xml/mtgx",
      "@_xmlns:y": "http://www.yworks.com/xml/graphml",
      key: [
        { "@_for": "node", "@_id": "d0", "@_yfiles.type": "entity" },
        { "@_for": "node", "@_id": "d1", "@_yfiles.type": "nodegraphics" },
        { "@_for": "edge", "@_id": "d2", "@_yfiles.type": "link" }
      ],
      graph: {
        "@_id": "G",
        "@_edgedefault": "directed",
        node: entities.map(entityToNode),
        edge: links.map(linkToEdge)
      }
    }
  };

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    format: true,
    suppressEmptyNode: false
  });
  const xml = builder.build(doc);

  const zip = new JSZip();
  zip.file("Graphs/Graph1.graphml", xml);
  zip.file("version.properties", "maltego.graph.version=1.5\nmaltego.client.version=4.11\n");
  return zip.generateAsync({ type: "uint8array" });
}

export async function writeMtgxFile(graph: Graph, path: string): Promise<void> {
  const { writeFile, mkdir } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  const bytes = await writeMtgxBytes(graph);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}
```

- [ ] **Step 4: Run, verify it passes**

Run: `npm test -- tests/unit/graph/writer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/graph/writer.ts tests/unit/graph/writer.test.ts
git commit -m "feat(graph): GraphML writer + .mtgx zip packaging"
```

---

## Task 7: Golden fixture setup (manual) and golden comparison test

**Files:**
- Create: `fixtures/golden/README.md`
- Create: `fixtures/golden/simple-3-entities.mtgx` (manual, by user)
- Create: `fixtures/golden/mixed-types.mtgx` (manual, by user)
- Create: `tests/unit/graph/writer.golden.test.ts`

- [ ] **Step 1: Write instructions for manual fixture creation**

`fixtures/golden/README.md`:
```markdown
# Golden fixtures

These `.mtgx` files are the ground truth for the writer. Exported from Maltego Desktop by hand so they represent exactly what Maltego would produce for simple inputs.

## How to regenerate

1. Open Maltego Desktop.
2. File > New Graph.
3. Build the graph per the instructions below. Set positions by hand to match the expected grid layout (column 0 at x=0, column 1 at x=240, rows stacked at y=0, 140, 280).
4. File > Save As > choose `.mtgx` format, save into this directory.

## Fixtures

### `simple-3-entities.mtgx`
- Entity 1: `maltego.Domain` value=`a.com` at (0, 0)
- Entity 2: `maltego.Domain` value=`b.com` at (0, 140)
- Entity 3: `maltego.IPv4Address` value=`1.2.3.4` at (240, 0)
- Link: entity 1 -> entity 3, label `resolves to`
- Link: entity 2 -> entity 3, label `resolves to`

### `mixed-types.mtgx`
- Entity 1: `maltego.Domain` value=`evil.example` at (0, 0)
- Entity 2: `maltego.EmailAddress` value=`admin@evil.example` at (240, 0)
- Entity 3: `maltego.Hash` value=`d41d8cd98f00b204e9800998ecf8427e` (md5) at (480, 0)
- Entity 4: `maltego.Phrase` value=`[T1566] Phishing` at (720, 0)
- Link: entity 1 -> entity 2, label `hosts`
- Link: entity 2 -> entity 3, label `dropped`
- Link: entity 3 -> entity 4, label `uses technique`
```

- [ ] **Step 2: Manual: create fixture files in Maltego and save into `fixtures/golden/`**

Build `simple-3-entities.mtgx` and `mixed-types.mtgx` per the README above and save them into `fixtures/golden/`.

- [ ] **Step 3: Verify fixtures exist and are valid zips**

Run: `ls fixtures/golden/ && unzip -l fixtures/golden/simple-3-entities.mtgx`
Expected: both `.mtgx` files present, each contains a `Graphs/Graph1.graphml` entry.

- [ ] **Step 4: Write golden comparison test**

`tests/unit/graph/writer.golden.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { Graph } from "../../../src/graph/graph.js";
import { writeMtgxBytes } from "../../../src/graph/writer.js";

async function extractGraphML(bytes: Uint8Array | Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  return zip.file("Graphs/Graph1.graphml")!.async("string");
}

function structurally(xml: string) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const parsed = parser.parse(xml);
  const graph = parsed.graphml.graph;
  const nodes = Array.isArray(graph.node) ? graph.node : [graph.node];
  const edges = graph.edge ? (Array.isArray(graph.edge) ? graph.edge : [graph.edge]) : [];
  return {
    entityTypes: nodes.map((n: any) => n.data[0]["mtg:MaltegoEntity"]["@_type"]).sort(),
    edgeCount: edges.length
  };
}

describe("writer golden fixtures", () => {
  it("matches simple-3-entities structurally", async () => {
    const goldenPath = resolve(__dirname, "../../../fixtures/golden/simple-3-entities.mtgx");
    const golden = await readFile(goldenPath);
    const goldenShape = structurally(await extractGraphML(golden));

    const g = new Graph("g-1", "simple");
    const a = g.addEntity({ type: "Domain", value: "a.com", properties: {} });
    const b = g.addEntity({ type: "Domain", value: "b.com", properties: {} });
    const ip = g.addEntity({ type: "IPv4Address", value: "1.2.3.4", properties: {} });
    g.addLink({ from: a.id, to: ip.id, label: "resolves to", properties: {} });
    g.addLink({ from: b.id, to: ip.id, label: "resolves to", properties: {} });
    const ourShape = structurally(await extractGraphML(await writeMtgxBytes(g)));

    expect(ourShape.entityTypes).toEqual(goldenShape.entityTypes);
    expect(ourShape.edgeCount).toBe(goldenShape.edgeCount);
  });

  it("matches mixed-types structurally", async () => {
    const goldenPath = resolve(__dirname, "../../../fixtures/golden/mixed-types.mtgx");
    const golden = await readFile(goldenPath);
    const goldenShape = structurally(await extractGraphML(golden));

    const g = new Graph("g-1", "mixed");
    const d = g.addEntity({ type: "Domain", value: "evil.example", properties: {} });
    const e = g.addEntity({ type: "EmailAddress", value: "admin@evil.example", properties: {} });
    const h = g.addEntity({ type: "Hash", value: "d41d8cd98f00b204e9800998ecf8427e", properties: { algorithm: "md5" } });
    const p = g.addEntity({ type: "Phrase", value: "[T1566] Phishing", properties: {} });
    g.addLink({ from: d.id, to: e.id, label: "hosts", properties: {} });
    g.addLink({ from: e.id, to: h.id, label: "dropped", properties: {} });
    g.addLink({ from: h.id, to: p.id, label: "uses technique", properties: {} });
    const ourShape = structurally(await extractGraphML(await writeMtgxBytes(g)));

    expect(ourShape.entityTypes).toEqual(goldenShape.entityTypes);
    expect(ourShape.edgeCount).toBe(goldenShape.edgeCount);
  });
});
```

- [ ] **Step 5: Run, verify it passes**

Run: `npm test -- tests/unit/graph/writer.golden.test.ts`
Expected: PASS. If Maltego's on-disk format differs from what we generate, iterate on `writer.ts` to match the golden shape.

- [ ] **Step 6: Commit**

```bash
git add fixtures/golden/ tests/unit/graph/writer.golden.test.ts
git commit -m "test(graph): golden fixture comparison for .mtgx writer"
```

---

## Task 8: MTGX reader (round-trip)

**Files:**
- Create: `src/graph/reader.ts`
- Create: `tests/unit/graph/reader.test.ts`

- [ ] **Step 1: Write failing test**

`tests/unit/graph/reader.test.ts`:
```ts
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
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `npm test -- tests/unit/graph/reader.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/graph/reader.ts`**

```ts
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { Graph } from "./graph.js";

export async function readMtgxBytes(bytes: Uint8Array | Buffer, newGraphId: string): Promise<Graph> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch (err) {
    throw new Error(`failed to parse .mtgx zip: ${(err as Error).message}`);
  }
  const file = zip.file("Graphs/Graph1.graphml");
  if (!file) {
    throw new Error("missing Graphs/Graph1.graphml in .mtgx archive");
  }
  const xml = await file.async("string");
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const parsed = parser.parse(xml);
  const gml = parsed.graphml?.graph;
  if (!gml) {
    throw new Error("no graphml/graph element in .mtgx");
  }

  const graph = new Graph(newGraphId, "imported");
  const idMap = new Map<string, string>();
  const nodes = gml.node ? (Array.isArray(gml.node) ? gml.node : [gml.node]) : [];
  for (const node of nodes) {
    const oldId = node["@_id"];
    const dataEntries = Array.isArray(node.data) ? node.data : [node.data];
    const entityData = dataEntries.find((d: any) => d["mtg:MaltegoEntity"]);
    const type = entityData?.["mtg:MaltegoEntity"]?.["@_type"] ?? "maltego.Phrase";
    const propsBlock = entityData?.["mtg:MaltegoEntity"]?.["mtg:Properties"]?.["mtg:Property"] ?? [];
    const propsArr = Array.isArray(propsBlock) ? propsBlock : [propsBlock];
    let value = "";
    const properties: Record<string, string> = {};
    for (const p of propsArr) {
      const name = p?.["@_name"];
      const val = String(p?.["mtg:Value"] ?? "");
      if (name === "properties.value") {
        value = val;
      } else if (name) {
        properties[name] = val;
      }
    }
    const added = graph.addEntity({ type, value, properties });
    idMap.set(oldId, added.id);
  }

  const edges = gml.edge ? (Array.isArray(gml.edge) ? gml.edge : [gml.edge]) : [];
  for (const edge of edges) {
    const fromOld = edge["@_source"];
    const toOld = edge["@_target"];
    const from = idMap.get(fromOld);
    const to = idMap.get(toOld);
    if (!from || !to) continue;
    const edgeData = edge.data;
    const linkProps = edgeData?.["mtg:MaltegoLink"]?.["mtg:Properties"]?.["mtg:Property"];
    const propsArr = linkProps ? (Array.isArray(linkProps) ? linkProps : [linkProps]) : [];
    let label: string | undefined;
    const properties: Record<string, string> = {};
    for (const p of propsArr) {
      const name = p?.["@_name"];
      const val = String(p?.["mtg:Value"] ?? "");
      if (name === "maltego.link.label") {
        label = val;
      } else if (name) {
        properties[name] = val;
      }
    }
    graph.addLink({ from, to, label, properties });
  }
  return graph;
}

export async function readMtgxFile(path: string, newGraphId: string): Promise<Graph> {
  const { readFile } = await import("node:fs/promises");
  const bytes = await readFile(path);
  return readMtgxBytes(bytes, newGraphId);
}
```

- [ ] **Step 4: Run, verify it passes**

Run: `npm test -- tests/unit/graph/reader.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/graph/reader.ts tests/unit/graph/reader.test.ts
git commit -m "feat(graph): .mtgx reader with round-trip support"
```

---

## Task 9: Whois lookup

**Files:**
- Create: `src/lookups/whois.ts`
- Create: `tests/unit/lookups/whois.test.ts`
- Create: `fixtures/responses/whois-example.com.txt`

- [ ] **Step 1: Capture a fixture response**

`fixtures/responses/whois-example.com.txt`:
```
Domain Name: EXAMPLE.COM
Registry Domain ID: 2336799_DOMAIN_COM-VRSN
Registrar: RESERVED-Internet Assigned Numbers Authority
Name Server: A.IANA-SERVERS.NET
Name Server: B.IANA-SERVERS.NET
Creation Date: 1995-08-14T04:00:00Z
Updated Date: 2023-08-14T07:01:31Z
Registry Expiry Date: 2024-08-13T04:00:00Z
```

- [ ] **Step 2: Write failing test**

`tests/unit/lookups/whois.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { whoisLookup } from "../../../src/lookups/whois.js";

vi.mock("whois", () => ({
  default: {
    lookup: (domain: string, cb: (err: Error | null, data: string) => void) => {
      readFile(resolve(__dirname, "../../../fixtures/responses/whois-example.com.txt"), "utf8")
        .then((data) => cb(null, data));
    }
  }
}));

describe("whoisLookup", () => {
  it("parses registrar, nameservers, creation, expiry", async () => {
    const result = await whoisLookup("example.com");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.registrar).toMatch(/IANA/);
      expect(result.data.nameservers).toContain("A.IANA-SERVERS.NET");
      expect(result.data.nameservers).toContain("B.IANA-SERVERS.NET");
      expect(result.data.creationDate).toBeDefined();
      expect(result.data.registryExpiryDate).toBeDefined();
    }
  });
});
```

- [ ] **Step 3: Run, verify it fails**

Run: `npm test -- tests/unit/lookups/whois.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement `src/lookups/whois.ts`**

```ts
import whoisLib from "whois";
import type { LookupOutcome } from "../types.js";

export interface WhoisData {
  domain: string;
  raw: string;
  registrar?: string;
  nameservers: string[];
  creationDate?: string;
  updatedDate?: string;
  registryExpiryDate?: string;
}

function extract(line: RegExp, text: string): string | undefined {
  const m = text.match(line);
  return m ? m[1].trim() : undefined;
}

function extractAll(line: RegExp, text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(line)) {
    out.push(match[1].trim());
  }
  return out;
}

export function whoisLookup(domain: string): Promise<LookupOutcome<WhoisData>> {
  return new Promise((resolvePromise) => {
    whoisLib.lookup(domain, (err: Error | null, data: string) => {
      if (err) {
        resolvePromise({
          ok: false,
          error: `whois lookup failed: ${err.message}`,
          retriable: true
        });
        return;
      }
      const text = data ?? "";
      resolvePromise({
        ok: true,
        data: {
          domain,
          raw: text,
          registrar: extract(/^\s*Registrar:\s*(.+)$/im, text),
          nameservers: extractAll(/^\s*Name Server:\s*(.+)$/gim, text).map((s) => s.toUpperCase()),
          creationDate: extract(/^\s*Creation Date:\s*(.+)$/im, text),
          updatedDate: extract(/^\s*Updated Date:\s*(.+)$/im, text),
          registryExpiryDate: extract(/^\s*Registry Expiry Date:\s*(.+)$/im, text)
        }
      });
    });
  });
}
```

- [ ] **Step 5: Run, verify it passes**

Run: `npm test -- tests/unit/lookups/whois.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lookups/whois.ts tests/unit/lookups/whois.test.ts fixtures/responses/whois-example.com.txt
git commit -m "feat(lookups): whois lookup with parsed fields"
```

---

## Task 10: DNS lookup

**Files:**
- Create: `src/lookups/dns.ts`
- Create: `tests/unit/lookups/dns.test.ts`

- [ ] **Step 1: Write failing test**

`tests/unit/lookups/dns.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { dnsLookup } from "../../../src/lookups/dns.js";

vi.mock("node:dns/promises", () => ({
  resolve4: vi.fn().mockResolvedValue(["93.184.216.34"]),
  resolve6: vi.fn().mockResolvedValue(["2606:2800:220:1:248:1893:25c8:1946"]),
  resolveMx: vi.fn().mockResolvedValue([{ exchange: "mail.example.com", priority: 10 }]),
  resolveNs: vi.fn().mockResolvedValue(["a.iana-servers.net", "b.iana-servers.net"]),
  resolveTxt: vi.fn().mockResolvedValue([["v=spf1 -all"]])
}));

describe("dnsLookup", () => {
  it("returns A, AAAA, MX, NS, TXT records", async () => {
    const result = await dnsLookup("example.com");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.a).toContain("93.184.216.34");
      expect(result.data.aaaa).toContain("2606:2800:220:1:248:1893:25c8:1946");
      expect(result.data.mx).toHaveLength(1);
      expect(result.data.mx[0].exchange).toBe("mail.example.com");
      expect(result.data.ns).toContain("a.iana-servers.net");
      expect(result.data.txt).toContain("v=spf1 -all");
    }
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `npm test -- tests/unit/lookups/dns.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lookups/dns.ts`**

```ts
import { resolve4, resolve6, resolveMx, resolveNs, resolveTxt } from "node:dns/promises";
import type { LookupOutcome } from "../types.js";

export interface DnsData {
  domain: string;
  a: string[];
  aaaa: string[];
  mx: { exchange: string; priority: number }[];
  ns: string[];
  txt: string[];
}

async function safe<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

export async function dnsLookup(domain: string): Promise<LookupOutcome<DnsData>> {
  try {
    const [a, aaaa, mx, ns, txt] = await Promise.all([
      safe(resolve4(domain), [] as string[]),
      safe(resolve6(domain), [] as string[]),
      safe(resolveMx(domain), [] as { exchange: string; priority: number }[]),
      safe(resolveNs(domain), [] as string[]),
      safe(resolveTxt(domain), [] as string[][])
    ]);
    return {
      ok: true,
      data: {
        domain,
        a,
        aaaa,
        mx,
        ns,
        txt: txt.flat()
      }
    };
  } catch (err) {
    return {
      ok: false,
      error: `dns lookup failed: ${(err as Error).message}`,
      retriable: true
    };
  }
}
```

- [ ] **Step 4: Run, verify it passes**

Run: `npm test -- tests/unit/lookups/dns.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lookups/dns.ts tests/unit/lookups/dns.test.ts
git commit -m "feat(lookups): DNS lookup (A/AAAA/MX/NS/TXT)"
```

---

## Task 11: ASN lookup (Team Cymru DNS)

**Files:**
- Create: `src/lookups/asn.ts`
- Create: `tests/unit/lookups/asn.test.ts`

- [ ] **Step 1: Write failing test**

`tests/unit/lookups/asn.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { asnLookup } from "../../../src/lookups/asn.js";

vi.mock("node:dns/promises", () => ({
  resolveTxt: vi.fn().mockImplementation((host: string) => {
    if (host === "4.3.2.1.origin.asn.cymru.com") {
      return Promise.resolve([["15169 | 8.8.8.0/24 | US | arin | 1992-12-01"]]);
    }
    if (host === "AS15169.asn.cymru.com") {
      return Promise.resolve([["15169 | US | arin | 2000-03-30 | GOOGLE, US"]]);
    }
    return Promise.reject(new Error("NXDOMAIN"));
  })
}));

describe("asnLookup", () => {
  it("returns ASN, prefix, registry, org for an IPv4", async () => {
    const result = await asnLookup("1.2.3.4");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.asn).toBe(15169);
      expect(result.data.prefix).toBe("8.8.8.0/24");
      expect(result.data.country).toBe("US");
      expect(result.data.registry).toBe("arin");
      expect(result.data.organization).toMatch(/GOOGLE/);
    }
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `npm test -- tests/unit/lookups/asn.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/lookups/asn.ts`**

```ts
import { resolveTxt } from "node:dns/promises";
import type { LookupOutcome } from "../types.js";

export interface AsnData {
  ip: string;
  asn: number;
  prefix: string;
  country: string;
  registry: string;
  allocated: string;
  organization?: string;
}

function reverseIPv4(ip: string): string {
  return ip.split(".").reverse().join(".");
}

export async function asnLookup(ip: string): Promise<LookupOutcome<AsnData>> {
  try {
    const reversed = reverseIPv4(ip);
    const originHost = `${reversed}.origin.asn.cymru.com`;
    const originRecords = await resolveTxt(originHost);
    const originText = originRecords[0]?.join("") ?? "";
    const [asnStr, prefix, country, registry, allocated] = originText
      .split("|")
      .map((s) => s.trim());
    const asn = parseInt(asnStr, 10);
    let organization: string | undefined;
    try {
      const asHost = `AS${asn}.asn.cymru.com`;
      const asRecords = await resolveTxt(asHost);
      const asText = asRecords[0]?.join("") ?? "";
      const parts = asText.split("|").map((s) => s.trim());
      organization = parts[4];
    } catch {
      organization = undefined;
    }
    return {
      ok: true,
      data: { ip, asn, prefix, country, registry, allocated, organization }
    };
  } catch (err) {
    return {
      ok: false,
      error: `asn lookup failed: ${(err as Error).message}`,
      retriable: true
    };
  }
}
```

- [ ] **Step 4: Run, verify it passes**

Run: `npm test -- tests/unit/lookups/asn.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lookups/asn.ts tests/unit/lookups/asn.test.ts
git commit -m "feat(lookups): ASN lookup via Team Cymru DNS"
```

---

## Task 12: crt.sh certificate transparency lookup

**Files:**
- Create: `src/lookups/crtsh.ts`
- Create: `tests/unit/lookups/crtsh.test.ts`
- Create: `fixtures/responses/crtsh-example.com.json`

- [ ] **Step 1: Capture fixture**

`fixtures/responses/crtsh-example.com.json`:
```json
[
  {"issuer_ca_id":16418,"issuer_name":"C=US, O=DigiCert Inc, CN=DigiCert TLS RSA SHA256 2020 CA1","common_name":"www.example.com","name_value":"*.example.com\nexample.com","id":12345678,"entry_timestamp":"2023-01-15T12:34:56","not_before":"2023-01-15T00:00:00","not_after":"2024-01-15T23:59:59","serial_number":"0abc"}
]
```

- [ ] **Step 2: Write failing test**

`tests/unit/lookups/crtsh.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher, Dispatcher } from "undici";
import { crtshLookup } from "../../../src/lookups/crtsh.js";

let originalDispatcher: Dispatcher;
let mockAgent: MockAgent;

beforeEach(() => {
  originalDispatcher = getGlobalDispatcher();
  mockAgent = new MockAgent();
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);
});

afterEach(async () => {
  await mockAgent.close();
  setGlobalDispatcher(originalDispatcher);
});

describe("crtshLookup", () => {
  it("parses cert entries for a domain", async () => {
    const fixture = await readFile(
      resolve(__dirname, "../../../fixtures/responses/crtsh-example.com.json"),
      "utf8"
    );
    mockAgent
      .get("https://crt.sh")
      .intercept({ path: "/?q=example.com&output=json" })
      .reply(200, fixture, { headers: { "content-type": "application/json" } });

    const result = await crtshLookup("example.com");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.certs).toHaveLength(1);
      expect(result.data.certs[0].commonName).toBe("www.example.com");
      expect(result.data.certs[0].sans).toContain("*.example.com");
      expect(result.data.certs[0].sans).toContain("example.com");
    }
  });

  it("returns retriable error on 429", async () => {
    mockAgent
      .get("https://crt.sh")
      .intercept({ path: "/?q=example.com&output=json" })
      .reply(429, "", { headers: { "retry-after": "60" } });

    const result = await crtshLookup("example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.retriable).toBe(true);
      expect(result.retryAfterMs).toBe(60_000);
    }
  });
});
```

- [ ] **Step 3: Run, verify it fails**

Run: `npm test -- tests/unit/lookups/crtsh.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement `src/lookups/crtsh.ts`**

```ts
import { request } from "undici";
import type { LookupOutcome } from "../types.js";

export interface CrtshCert {
  id: number;
  commonName: string;
  issuer: string;
  sans: string[];
  notBefore: string;
  notAfter: string;
  serialNumber: string;
  entryTimestamp: string;
}

export interface CrtshData {
  domain: string;
  certs: CrtshCert[];
}

export async function crtshLookup(domain: string): Promise<LookupOutcome<CrtshData>> {
  const url = `https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`;
  let res;
  try {
    res = await request(url, { method: "GET", headersTimeout: 30_000, bodyTimeout: 30_000 });
  } catch (err) {
    return {
      ok: false,
      error: `crt.sh request failed: ${(err as Error).message}`,
      retriable: true
    };
  }

  if (res.statusCode === 429) {
    const ra = res.headers["retry-after"];
    const seconds = typeof ra === "string" ? parseInt(ra, 10) : NaN;
    return {
      ok: false,
      error: "crt.sh rate limited",
      retriable: true,
      retryAfterMs: Number.isFinite(seconds) ? seconds * 1000 : 30_000
    };
  }
  if (res.statusCode >= 400) {
    return {
      ok: false,
      error: `crt.sh returned ${res.statusCode}`,
      retriable: res.statusCode >= 500
    };
  }

  const rows = (await res.body.json()) as Array<{
    id: number;
    common_name: string;
    issuer_name: string;
    name_value: string;
    not_before: string;
    not_after: string;
    serial_number: string;
    entry_timestamp: string;
  }>;

  return {
    ok: true,
    data: {
      domain,
      certs: rows.map((r) => ({
        id: r.id,
        commonName: r.common_name,
        issuer: r.issuer_name,
        sans: r.name_value.split("\n").filter((s) => s.length > 0),
        notBefore: r.not_before,
        notAfter: r.not_after,
        serialNumber: r.serial_number,
        entryTimestamp: r.entry_timestamp
      }))
    }
  };
}
```

- [ ] **Step 5: Run, verify it passes**

Run: `npm test -- tests/unit/lookups/crtsh.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lookups/crtsh.ts tests/unit/lookups/crtsh.test.ts fixtures/responses/crtsh-example.com.json
git commit -m "feat(lookups): crt.sh certificate transparency lookup with rate-limit handling"
```

---

## Task 13: Graph handle registry

**Files:**
- Create: `src/server/registry.ts`
- Create: `tests/unit/server/registry.test.ts`

- [ ] **Step 1: Write failing test**

`tests/unit/server/registry.test.ts`:
```ts
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
```

- [ ] **Step 2: Run, verify it fails**

Run: `npm test -- tests/unit/server/registry.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/server/registry.ts`**

```ts
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
```

- [ ] **Step 4: Run, verify it passes**

Run: `npm test -- tests/unit/server/registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/registry.ts tests/unit/server/registry.test.ts
git commit -m "feat(server): in-memory graph handle registry"
```

---

## Task 14: Structured error types

**Files:**
- Create: `src/server/errors.ts`

- [ ] **Step 1: Implement `src/server/errors.ts`**

```ts
export class ToolValidationError extends Error {
  constructor(message: string, readonly suggestions?: string[]) {
    super(message);
    this.name = "ToolValidationError";
  }
}

export class ToolFileSystemError extends Error {
  constructor(message: string, readonly path: string, readonly cause?: NodeJS.ErrnoException) {
    super(message);
    this.name = "ToolFileSystemError";
  }
}

export class ToolParseError extends Error {
  constructor(message: string, readonly path?: string) {
    super(message);
    this.name = "ToolParseError";
  }
}

export function toToolResponse(err: unknown): {
  isError: true;
  content: { type: "text"; text: string }[];
} {
  const message =
    err instanceof Error ? `${err.name}: ${err.message}` : `UnknownError: ${String(err)}`;
  return {
    isError: true,
    content: [{ type: "text", text: message }]
  };
}
```

- [ ] **Step 2: Verify types compile**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/server/errors.ts
git commit -m "feat(server): structured tool error classes"
```

---

## Task 15: Graph tools (MCP handlers)

**Files:**
- Create: `src/tools/graph.ts`
- Create: `tests/unit/tools/graph.test.ts`

- [ ] **Step 1: Write failing test**

`tests/unit/tools/graph.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { tmpdir } from "node:os";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { GraphRegistry } from "../../../src/server/registry.js";
import { graphToolHandlers } from "../../../src/tools/graph.js";

describe("graph tools", () => {
  let reg: GraphRegistry;
  let tmp: string;
  beforeEach(async () => {
    reg = new GraphRegistry();
    tmp = await mkdtemp(join(tmpdir(), "maltego-mcp-test-"));
  });

  it("maltego_create_graph creates a new graph", async () => {
    const tools = graphToolHandlers(reg);
    const res = await tools.maltego_create_graph({ name: "demo" });
    expect(res.graphId).toMatch(/^g-/);
    expect(reg.get(res.graphId)).toBeDefined();
  });

  it("maltego_add_entity and maltego_add_link build a graph", async () => {
    const tools = graphToolHandlers(reg);
    const { graphId } = await tools.maltego_create_graph({ name: "d" });
    const a = await tools.maltego_add_entity({ graphId, type: "Domain", value: "a.com" });
    const b = await tools.maltego_add_entity({ graphId, type: "IPv4Address", value: "1.2.3.4" });
    const l = await tools.maltego_add_link({ graphId, from: a.entityId, to: b.entityId, label: "resolves" });
    expect(l.linkId).toMatch(/^l-/);
    const g = reg.getOrThrow(graphId);
    expect(g.entityCount()).toBe(2);
    expect(g.linkCount()).toBe(1);
  });

  it("maltego_save_graph writes a .mtgx file and refuses overwrite", async () => {
    const tools = graphToolHandlers(reg);
    const { graphId } = await tools.maltego_create_graph({ name: "s" });
    await tools.maltego_add_entity({ graphId, type: "Domain", value: "a.com" });
    const path = join(tmp, "out.mtgx");
    const saved = await tools.maltego_save_graph({ graphId, path });
    expect(saved.path).toBe(path);
    const bytes = await readFile(path);
    expect(bytes.byteLength).toBeGreaterThan(0);

    await expect(tools.maltego_save_graph({ graphId, path })).rejects.toThrow(/exists/);
    await tools.maltego_save_graph({ graphId, path, overwrite: true });
    await rm(tmp, { recursive: true, force: true });
  });

  it("maltego_load_graph parses a saved .mtgx into a new handle", async () => {
    const tools = graphToolHandlers(reg);
    const { graphId } = await tools.maltego_create_graph({ name: "l" });
    const a = await tools.maltego_add_entity({ graphId, type: "Domain", value: "a.com" });
    const b = await tools.maltego_add_entity({ graphId, type: "IPv4Address", value: "1.2.3.4" });
    await tools.maltego_add_link({ graphId, from: a.entityId, to: b.entityId, label: "r" });
    const path = join(tmp, "rt.mtgx");
    await tools.maltego_save_graph({ graphId, path });

    const loaded = await tools.maltego_load_graph({ path });
    expect(loaded.graphId).not.toBe(graphId);
    expect(loaded.entityCount).toBe(2);
    expect(loaded.linkCount).toBe(1);
    await rm(tmp, { recursive: true, force: true });
  });

  it("maltego_add_entity throws on unknown type", async () => {
    const tools = graphToolHandlers(reg);
    const { graphId } = await tools.maltego_create_graph({ name: "e" });
    await expect(
      tools.maltego_add_entity({ graphId, type: "NotARealType", value: "x" })
    ).rejects.toThrow(/Unknown entity type/);
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `npm test -- tests/unit/tools/graph.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/tools/graph.ts`**

```ts
import { access } from "node:fs/promises";
import { GraphRegistry } from "../server/registry.js";
import { writeMtgxFile } from "../graph/writer.js";
import { readMtgxFile } from "../graph/reader.js";
import { ToolFileSystemError, ToolValidationError } from "../server/errors.js";
import { randomUUID } from "node:crypto";

export interface CreateGraphInput { name: string; }
export interface AddEntityInput {
  graphId: string;
  type: string;
  value: string;
  properties?: Record<string, string>;
  notes?: string;
}
export interface AddLinkInput {
  graphId: string;
  from: string;
  to: string;
  label?: string;
  properties?: Record<string, string>;
}
export interface SaveGraphInput {
  graphId: string;
  path: string;
  overwrite?: boolean;
}
export interface LoadGraphInput { path: string; }

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function resolveHomeTilde(path: string): string {
  if (!path.startsWith("~")) return path;
  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) throw new ToolValidationError("cannot resolve '~': no HOME/USERPROFILE set");
  return path.replace(/^~/, home);
}

function rejectTraversal(path: string): void {
  if (path.includes("\0")) {
    throw new ToolValidationError(`path contains NUL byte: ${path}`);
  }
}

export function graphToolHandlers(reg: GraphRegistry) {
  return {
    async maltego_create_graph(input: CreateGraphInput) {
      if (!input?.name) throw new ToolValidationError("name is required");
      const g = reg.create(input.name);
      return { graphId: g.id, name: g.name };
    },

    async maltego_add_entity(input: AddEntityInput) {
      const g = reg.getOrThrow(input.graphId);
      const entity = g.addEntity({
        type: input.type,
        value: input.value,
        properties: input.properties ?? {},
        notes: input.notes
      });
      return { entityId: entity.id, type: entity.type, value: entity.value };
    },

    async maltego_add_link(input: AddLinkInput) {
      const g = reg.getOrThrow(input.graphId);
      const link = g.addLink({
        from: input.from,
        to: input.to,
        label: input.label,
        properties: input.properties ?? {}
      });
      return { linkId: link.id, from: link.from, to: link.to };
    },

    async maltego_save_graph(input: SaveGraphInput) {
      const g = reg.getOrThrow(input.graphId);
      const resolved = resolveHomeTilde(input.path);
      rejectTraversal(resolved);
      if (!input.overwrite && (await pathExists(resolved))) {
        throw new ToolFileSystemError(
          `refusing to overwrite existing file (pass overwrite=true): ${resolved}`,
          resolved
        );
      }
      try {
        await writeMtgxFile(g, resolved);
      } catch (err) {
        throw new ToolFileSystemError(
          `failed to write .mtgx: ${(err as Error).message}`,
          resolved,
          err as NodeJS.ErrnoException
        );
      }
      return {
        path: resolved,
        entityCount: g.entityCount(),
        linkCount: g.linkCount()
      };
    },

    async maltego_load_graph(input: LoadGraphInput) {
      const resolved = resolveHomeTilde(input.path);
      rejectTraversal(resolved);
      const newId = `g-${randomUUID().slice(0, 8)}`;
      const g = await readMtgxFile(resolved, newId);
      reg.register(g);
      return { graphId: g.id, entityCount: g.entityCount(), linkCount: g.linkCount() };
    }
  };
}

export type GraphTools = ReturnType<typeof graphToolHandlers>;
```

- [ ] **Step 4: Run, verify it passes**

Run: `npm test -- tests/unit/tools/graph.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/graph.ts tests/unit/tools/graph.test.ts
git commit -m "feat(tools): graph MCP tools (create, add_entity, add_link, save, load)"
```

---

## Task 16: Lookup tools (MCP handlers)

**Files:**
- Create: `src/tools/lookups.ts`
- Create: `tests/unit/tools/lookups.test.ts`

- [ ] **Step 1: Write failing test**

`tests/unit/tools/lookups.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { lookupToolHandlers } from "../../../src/tools/lookups.js";

vi.mock("../../../src/lookups/whois.js", () => ({
  whoisLookup: vi.fn().mockResolvedValue({
    ok: true,
    data: { domain: "example.com", raw: "...", registrar: "IANA", nameservers: ["NS1"] }
  })
}));
vi.mock("../../../src/lookups/dns.js", () => ({
  dnsLookup: vi.fn().mockResolvedValue({
    ok: true,
    data: { domain: "example.com", a: ["1.2.3.4"], aaaa: [], mx: [], ns: [], txt: [] }
  })
}));
vi.mock("../../../src/lookups/asn.js", () => ({
  asnLookup: vi.fn().mockResolvedValue({
    ok: true,
    data: { ip: "1.2.3.4", asn: 15169, prefix: "8.8.8.0/24", country: "US", registry: "arin", allocated: "1992-12-01" }
  })
}));
vi.mock("../../../src/lookups/crtsh.js", () => ({
  crtshLookup: vi.fn().mockResolvedValue({ ok: true, data: { domain: "example.com", certs: [] } })
}));

describe("lookup tools", () => {
  const tools = lookupToolHandlers();

  it("maltego_whois returns parsed data", async () => {
    const r = await tools.maltego_whois({ domain: "example.com" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.registrar).toBe("IANA");
  });

  it("maltego_dns returns A records", async () => {
    const r = await tools.maltego_dns({ domain: "example.com" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.a).toContain("1.2.3.4");
  });

  it("maltego_asn returns ASN data", async () => {
    const r = await tools.maltego_asn({ ip: "1.2.3.4" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.asn).toBe(15169);
  });

  it("maltego_crtsh returns cert entries", async () => {
    const r = await tools.maltego_crtsh({ domain: "example.com" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.certs).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `npm test -- tests/unit/tools/lookups.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/tools/lookups.ts`**

```ts
import { whoisLookup } from "../lookups/whois.js";
import { dnsLookup } from "../lookups/dns.js";
import { asnLookup } from "../lookups/asn.js";
import { crtshLookup } from "../lookups/crtsh.js";

export function lookupToolHandlers() {
  return {
    async maltego_whois(input: { domain: string }) {
      return whoisLookup(input.domain);
    },
    async maltego_dns(input: { domain: string }) {
      return dnsLookup(input.domain);
    },
    async maltego_asn(input: { ip: string }) {
      return asnLookup(input.ip);
    },
    async maltego_crtsh(input: { domain: string }) {
      return crtshLookup(input.domain);
    }
  };
}

export type LookupTools = ReturnType<typeof lookupToolHandlers>;
```

- [ ] **Step 4: Run, verify it passes**

Run: `npm test -- tests/unit/tools/lookups.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/lookups.ts tests/unit/tools/lookups.test.ts
git commit -m "feat(tools): lookup MCP tools (whois, dns, asn, crtsh)"
```

---

## Task 17: Expand tools (convenience composers)

**Files:**
- Create: `src/tools/expand.ts`
- Create: `tests/unit/tools/expand.test.ts`

- [ ] **Step 1: Write failing test**

`tests/unit/tools/expand.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { GraphRegistry } from "../../../src/server/registry.js";
import { expandToolHandlers } from "../../../src/tools/expand.js";

vi.mock("../../../src/lookups/whois.js", () => ({
  whoisLookup: vi.fn().mockResolvedValue({
    ok: true,
    data: { domain: "evil.example", raw: "", registrar: "BadCorp", nameservers: ["NS1.BAD"] }
  })
}));
vi.mock("../../../src/lookups/dns.js", () => ({
  dnsLookup: vi.fn().mockResolvedValue({
    ok: true,
    data: { domain: "evil.example", a: ["9.9.9.9"], aaaa: [], mx: [], ns: [], txt: [] }
  })
}));
vi.mock("../../../src/lookups/asn.js", () => ({
  asnLookup: vi.fn().mockResolvedValue({
    ok: true,
    data: { ip: "9.9.9.9", asn: 64512, prefix: "9.9.9.0/24", country: "US", registry: "arin", allocated: "2020-01-01", organization: "EVIL" }
  })
}));

describe("maltego_expand_domain", () => {
  let reg: GraphRegistry;
  let tmp: string;
  beforeEach(async () => {
    reg = new GraphRegistry();
    tmp = await mkdtemp(join(tmpdir(), "maltego-expand-"));
  });

  it("builds a graph with the domain, whois phrase, DNS IPs, and ASN", async () => {
    const tools = expandToolHandlers(reg);
    const out = join(tmp, "evil.mtgx");
    const result = await tools.maltego_expand_domain({ domain: "evil.example", outputPath: out });
    expect(result.entityCount).toBeGreaterThanOrEqual(3);
    expect(result.linkCount).toBeGreaterThanOrEqual(2);
    const g = reg.getOrThrow(result.graphId);
    const values = g.allEntities().map((e) => e.value);
    expect(values).toContain("evil.example");
    expect(values).toContain("9.9.9.9");
    await rm(tmp, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `npm test -- tests/unit/tools/expand.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/tools/expand.ts`**

```ts
import { GraphRegistry } from "../server/registry.js";
import { writeMtgxFile } from "../graph/writer.js";
import { whoisLookup } from "../lookups/whois.js";
import { dnsLookup } from "../lookups/dns.js";
import { asnLookup } from "../lookups/asn.js";

export interface ExpandIpInput { ip: string; outputPath: string; overwrite?: boolean; }
export interface ExpandDomainInput { domain: string; outputPath: string; overwrite?: boolean; }
export interface ExpandHashInput { hash: string; algorithm?: "md5" | "sha1" | "sha256" | "sha512"; outputPath: string; overwrite?: boolean; }

function resolveHomeTilde(path: string): string {
  if (!path.startsWith("~")) return path;
  const home = process.env.HOME || process.env.USERPROFILE || "";
  return path.replace(/^~/, home);
}

export function expandToolHandlers(reg: GraphRegistry) {
  return {
    async maltego_expand_ip(input: ExpandIpInput) {
      const g = reg.create(`expand-ip-${input.ip}`);
      const ipE = g.addEntity({ type: "IPv4Address", value: input.ip, properties: {} });

      const asn = await asnLookup(input.ip);
      if (asn.ok) {
        const asE = g.addEntity({
          type: "AS",
          value: String(asn.data.asn),
          properties: { organization: asn.data.organization ?? "", country: asn.data.country, registry: asn.data.registry }
        });
        g.addLink({ from: ipE.id, to: asE.id, label: `AS (${asn.data.prefix})`, properties: {} });
        if (asn.data.prefix) {
          const nb = g.addEntity({ type: "Netblock", value: asn.data.prefix, properties: {} });
          g.addLink({ from: ipE.id, to: nb.id, label: "within", properties: {} });
        }
      }

      const outPath = resolveHomeTilde(input.outputPath);
      await writeMtgxFile(g, outPath);
      return { graphId: g.id, path: outPath, entityCount: g.entityCount(), linkCount: g.linkCount() };
    },

    async maltego_expand_domain(input: ExpandDomainInput) {
      const g = reg.create(`expand-domain-${input.domain}`);
      const dE = g.addEntity({ type: "Domain", value: input.domain, properties: {} });

      const [whois, dns] = await Promise.all([whoisLookup(input.domain), dnsLookup(input.domain)]);

      if (whois.ok) {
        const w = whois.data;
        if (w.registrar) {
          const rE = g.addEntity({
            type: "Phrase",
            value: `[registrar] ${w.registrar}`,
            properties: { creationDate: w.creationDate ?? "", expiryDate: w.registryExpiryDate ?? "" }
          });
          g.addLink({ from: dE.id, to: rE.id, label: "registered via", properties: {} });
        }
        for (const ns of w.nameservers) {
          const nsE = g.addEntity({ type: "Domain", value: ns.toLowerCase(), properties: { role: "nameserver" } });
          g.addLink({ from: dE.id, to: nsE.id, label: "uses NS", properties: {} });
        }
      }

      if (dns.ok) {
        for (const ip of dns.data.a) {
          const ipE = g.addEntity({ type: "IPv4Address", value: ip, properties: {} });
          g.addLink({ from: dE.id, to: ipE.id, label: "A record", properties: {} });
          const asn = await asnLookup(ip);
          if (asn.ok) {
            const asE = g.addEntity({
              type: "AS",
              value: String(asn.data.asn),
              properties: { organization: asn.data.organization ?? "" }
            });
            g.addLink({ from: ipE.id, to: asE.id, label: "AS", properties: {} });
          }
        }
      }

      const outPath = resolveHomeTilde(input.outputPath);
      await writeMtgxFile(g, outPath);
      return { graphId: g.id, path: outPath, entityCount: g.entityCount(), linkCount: g.linkCount() };
    },

    async maltego_expand_hash(input: ExpandHashInput) {
      const g = reg.create(`expand-hash-${input.hash.slice(0, 8)}`);
      g.addEntity({
        type: "Hash",
        value: input.hash,
        properties: { algorithm: input.algorithm ?? "unknown" }
      });
      const outPath = resolveHomeTilde(input.outputPath);
      await writeMtgxFile(g, outPath);
      return { graphId: g.id, path: outPath, entityCount: g.entityCount(), linkCount: g.linkCount() };
    }
  };
}

export type ExpandTools = ReturnType<typeof expandToolHandlers>;
```

- [ ] **Step 4: Run, verify it passes**

Run: `npm test -- tests/unit/tools/expand.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/expand.ts tests/unit/tools/expand.test.ts
git commit -m "feat(tools): expand_ip / expand_domain / expand_hash convenience tools"
```

---

## Task 18: MCP server entry

**Files:**
- Create: `src/config.ts`
- Modify: `src/index.ts` (replace placeholder)

- [ ] **Step 1: Create `src/config.ts`**

```ts
import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
  outputDir: string;
  lookupTimeoutMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const outputDir = env.MALTEGO_MCP_OUTPUT_DIR ?? join(homedir(), "MaltegoGraphs");
  const timeoutStr = env.MALTEGO_MCP_LOOKUP_TIMEOUT_MS;
  const parsed = timeoutStr ? parseInt(timeoutStr, 10) : NaN;
  const lookupTimeoutMs = Number.isFinite(parsed) && parsed > 0 ? parsed : 30_000;
  return { outputDir, lookupTimeoutMs };
}
```

- [ ] **Step 2: Replace `src/index.ts`**

```ts
#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

import { loadConfig } from "./config.js";
import { GraphRegistry } from "./server/registry.js";
import { graphToolHandlers } from "./tools/graph.js";
import { lookupToolHandlers } from "./tools/lookups.js";
import { expandToolHandlers } from "./tools/expand.js";
import { toToolResponse } from "./server/errors.js";

const config = loadConfig();
const registry = new GraphRegistry();
const graph = graphToolHandlers(registry);
const lookup = lookupToolHandlers();
const expand = expandToolHandlers(registry);

type Handler = (args: unknown) => Promise<unknown>;

const HANDLERS: Record<string, Handler> = {
  maltego_create_graph: (a) => graph.maltego_create_graph(a as any),
  maltego_add_entity: (a) => graph.maltego_add_entity(a as any),
  maltego_add_link: (a) => graph.maltego_add_link(a as any),
  maltego_save_graph: (a) => graph.maltego_save_graph(a as any),
  maltego_load_graph: (a) => graph.maltego_load_graph(a as any),
  maltego_whois: (a) => lookup.maltego_whois(a as any),
  maltego_dns: (a) => lookup.maltego_dns(a as any),
  maltego_asn: (a) => lookup.maltego_asn(a as any),
  maltego_crtsh: (a) => lookup.maltego_crtsh(a as any),
  maltego_expand_ip: (a) => expand.maltego_expand_ip(a as any),
  maltego_expand_domain: (a) => expand.maltego_expand_domain(a as any),
  maltego_expand_hash: (a) => expand.maltego_expand_hash(a as any)
};

const TOOL_DEFS = [
  { name: "maltego_create_graph", description: "Create a new empty Maltego graph. Returns graphId.", inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
  { name: "maltego_add_entity", description: "Add an entity (node) to a graph.", inputSchema: { type: "object", properties: { graphId: { type: "string" }, type: { type: "string" }, value: { type: "string" }, properties: { type: "object" }, notes: { type: "string" } }, required: ["graphId", "type", "value"] } },
  { name: "maltego_add_link", description: "Add a directed link between two entities.", inputSchema: { type: "object", properties: { graphId: { type: "string" }, from: { type: "string" }, to: { type: "string" }, label: { type: "string" }, properties: { type: "object" } }, required: ["graphId", "from", "to"] } },
  { name: "maltego_save_graph", description: "Save a graph to a .mtgx file.", inputSchema: { type: "object", properties: { graphId: { type: "string" }, path: { type: "string" }, overwrite: { type: "boolean" } }, required: ["graphId", "path"] } },
  { name: "maltego_load_graph", description: "Load an existing .mtgx into a new graph handle.", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
  { name: "maltego_whois", description: "Run a whois lookup for a domain.", inputSchema: { type: "object", properties: { domain: { type: "string" } }, required: ["domain"] } },
  { name: "maltego_dns", description: "Run a DNS lookup (A/AAAA/MX/NS/TXT).", inputSchema: { type: "object", properties: { domain: { type: "string" } }, required: ["domain"] } },
  { name: "maltego_asn", description: "Look up ASN / netblock / org for an IP via Team Cymru.", inputSchema: { type: "object", properties: { ip: { type: "string" } }, required: ["ip"] } },
  { name: "maltego_crtsh", description: "Certificate Transparency search via crt.sh.", inputSchema: { type: "object", properties: { domain: { type: "string" } }, required: ["domain"] } },
  { name: "maltego_expand_ip", description: "Build a .mtgx graph around an IP (ASN, netblock).", inputSchema: { type: "object", properties: { ip: { type: "string" }, outputPath: { type: "string" }, overwrite: { type: "boolean" } }, required: ["ip", "outputPath"] } },
  { name: "maltego_expand_domain", description: "Build a .mtgx graph around a domain (whois, DNS, ASN of A records).", inputSchema: { type: "object", properties: { domain: { type: "string" }, outputPath: { type: "string" }, overwrite: { type: "boolean" } }, required: ["domain", "outputPath"] } },
  { name: "maltego_expand_hash", description: "Build a .mtgx graph with a Hash entity (extend later).", inputSchema: { type: "object", properties: { hash: { type: "string" }, algorithm: { type: "string", enum: ["md5", "sha1", "sha256", "sha512"] }, outputPath: { type: "string" }, overwrite: { type: "boolean" } }, required: ["hash", "outputPath"] } }
];

const server = new Server(
  { name: "maltego-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_DEFS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;
  const handler = HANDLERS[name];
  if (!handler) {
    return toToolResponse(new Error(`unknown tool: ${name}`));
  }
  try {
    const result = await handler(request.params.arguments ?? {});
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return toToolResponse(err);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`maltego-mcp server ready (output dir: ${config.outputDir})`);
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
```

- [ ] **Step 3: Build and typecheck**

Run: `npm run build && npm run typecheck`
Expected: `dist/index.js` emitted, typecheck passes.

- [ ] **Step 4: Smoke-run the server**

Run: `node dist/index.js` (then Ctrl+C after the ready message appears)
Expected: stderr shows `maltego-mcp server ready (output dir: ...)`. Ctrl+C terminates cleanly. This is a startup check only; no tool calls are made.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/index.ts
git commit -m "feat(server): wire MCP stdio server with all tool handlers"
```

---

## Task 19: Integration test (canonical round-trip)

**Files:**
- Create: `tests/integration/round-trip.test.ts`

- [ ] **Step 1: Write the test**

`tests/integration/round-trip.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { GraphRegistry } from "../../src/server/registry.js";
import { graphToolHandlers } from "../../src/tools/graph.js";

describe("integration: canonical round-trip", () => {
  let reg: GraphRegistry;
  let tools: ReturnType<typeof graphToolHandlers>;
  let tmp: string;

  beforeEach(async () => {
    reg = new GraphRegistry();
    tools = graphToolHandlers(reg);
    tmp = await mkdtemp(join(tmpdir(), "maltego-mcp-int-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("create -> 5 entities -> 4 links -> save -> load -> shape matches", async () => {
    const { graphId } = await tools.maltego_create_graph({ name: "round-trip" });

    const a = await tools.maltego_add_entity({ graphId, type: "Domain", value: "evil.example" });
    const b = await tools.maltego_add_entity({ graphId, type: "IPv4Address", value: "9.9.9.9" });
    const c = await tools.maltego_add_entity({ graphId, type: "EmailAddress", value: "root@evil.example" });
    const d = await tools.maltego_add_entity({ graphId, type: "Hash", value: "d41d8cd98f00b204e9800998ecf8427e", properties: { algorithm: "md5" } });
    const e = await tools.maltego_add_entity({ graphId, type: "Phrase", value: "[T1566] Phishing" });

    await tools.maltego_add_link({ graphId, from: a.entityId, to: b.entityId, label: "resolves" });
    await tools.maltego_add_link({ graphId, from: a.entityId, to: c.entityId, label: "hosts" });
    await tools.maltego_add_link({ graphId, from: c.entityId, to: d.entityId, label: "dropped" });
    await tools.maltego_add_link({ graphId, from: d.entityId, to: e.entityId, label: "uses technique" });

    const outPath = join(tmp, "rt.mtgx");
    const saved = await tools.maltego_save_graph({ graphId, path: outPath });
    expect(saved.entityCount).toBe(5);
    expect(saved.linkCount).toBe(4);

    const loaded = await tools.maltego_load_graph({ path: outPath });
    expect(loaded.entityCount).toBe(5);
    expect(loaded.linkCount).toBe(4);

    const loadedGraph = reg.getOrThrow(loaded.graphId);
    const values = loadedGraph.allEntities().map((x) => x.value).sort();
    expect(values).toEqual([
      "9.9.9.9",
      "[T1566] Phishing",
      "d41d8cd98f00b204e9800998ecf8427e",
      "evil.example",
      "root@evil.example"
    ]);
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `npm run test:integration`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/round-trip.test.ts
git commit -m "test(integration): canonical create -> save -> load round-trip"
```

---

## Task 20: Integration tests (expand + error propagation)

**Files:**
- Create: `tests/integration/expand.test.ts`
- Create: `tests/integration/errors.test.ts`

- [ ] **Step 1: Write `expand.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { GraphRegistry } from "../../src/server/registry.js";
import { expandToolHandlers } from "../../src/tools/expand.js";

vi.mock("../../src/lookups/whois.js", () => ({
  whoisLookup: vi.fn().mockResolvedValue({
    ok: true,
    data: { domain: "evil.example", raw: "", registrar: "BadCorp", nameservers: ["NS1.BAD"] }
  })
}));
vi.mock("../../src/lookups/dns.js", () => ({
  dnsLookup: vi.fn().mockResolvedValue({
    ok: true,
    data: { domain: "evil.example", a: ["9.9.9.9"], aaaa: [], mx: [], ns: [], txt: [] }
  })
}));
vi.mock("../../src/lookups/asn.js", () => ({
  asnLookup: vi.fn().mockResolvedValue({
    ok: true,
    data: { ip: "9.9.9.9", asn: 64512, prefix: "9.9.9.0/24", country: "US", registry: "arin", allocated: "2020-01-01", organization: "EVIL" }
  })
}));

describe("integration: expand_domain writes a real .mtgx", () => {
  let reg: GraphRegistry;
  let tmp: string;

  beforeEach(async () => {
    reg = new GraphRegistry();
    tmp = await mkdtemp(join(tmpdir(), "maltego-expand-int-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("produces a non-empty .mtgx containing the domain and its resolved IP", async () => {
    const tools = expandToolHandlers(reg);
    const out = join(tmp, "evil.mtgx");
    const result = await tools.maltego_expand_domain({ domain: "evil.example", outputPath: out });
    const fstat = await stat(result.path);
    expect(fstat.size).toBeGreaterThan(100);
    const g = reg.getOrThrow(result.graphId);
    const values = g.allEntities().map((e) => e.value);
    expect(values).toContain("evil.example");
    expect(values).toContain("9.9.9.9");
  });
});
```

- [ ] **Step 2: Write `errors.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { GraphRegistry } from "../../src/server/registry.js";
import { graphToolHandlers } from "../../src/tools/graph.js";

describe("integration: error propagation", () => {
  let reg: GraphRegistry;
  let tools: ReturnType<typeof graphToolHandlers>;
  let tmp: string;

  beforeEach(async () => {
    reg = new GraphRegistry();
    tools = graphToolHandlers(reg);
    tmp = await mkdtemp(join(tmpdir(), "maltego-err-int-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("refuses to overwrite without flag, succeeds with flag", async () => {
    const { graphId } = await tools.maltego_create_graph({ name: "x" });
    await tools.maltego_add_entity({ graphId, type: "Domain", value: "a.com" });
    const out = join(tmp, "x.mtgx");
    await tools.maltego_save_graph({ graphId, path: out });
    await expect(tools.maltego_save_graph({ graphId, path: out })).rejects.toThrow(/exists/);
    await tools.maltego_save_graph({ graphId, path: out, overwrite: true });
  });

  it("throws parse error on malformed .mtgx", async () => {
    const bad = join(tmp, "bad.mtgx");
    await writeFile(bad, Buffer.from([0x00, 0x01, 0x02]));
    await expect(tools.maltego_load_graph({ path: bad })).rejects.toThrow(/parse|zip/i);
  });

  it("throws validation error with suggestions on unknown entity type", async () => {
    const { graphId } = await tools.maltego_create_graph({ name: "y" });
    await expect(
      tools.maltego_add_entity({ graphId, type: "IPv4", value: "1.2.3.4" })
    ).rejects.toThrow(/Unknown entity type/);
  });
});
```

- [ ] **Step 3: Run integration tests**

Run: `npm run test:integration`
Expected: PASS for both files.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/expand.test.ts tests/integration/errors.test.ts
git commit -m "test(integration): expand_domain end-to-end and error propagation"
```

---

## Task 21: README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace `README.md`**

```markdown
# maltego-mcp

MCP server that lets Claude author Maltego `.mtgx` graph files and run primitive OSINT lookups (whois / DNS / ASN / crt.sh). Graphs land on disk and you open them in Maltego Desktop.

## Requirements

- Node.js 20+
- Maltego Graph Desktop installed (Basic, Pro, or Enterprise)

## Install

```bash
git clone git@github.com:solomonneas/maltego-mcp.git
cd maltego-mcp
npm install
npm run build
```

## Register with Claude Code

```bash
claude mcp add maltego -- node /absolute/path/to/maltego-mcp/dist/index.js
```

## Register with Claude Desktop

Add to `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "maltego": {
      "command": "node",
      "args": ["C:\\Users\\srnea\\repos\\maltego-mcp\\dist\\index.js"]
    }
  }
}
```

Restart Claude Desktop. The `maltego_*` tools should appear.

## Environment variables

- `MALTEGO_MCP_OUTPUT_DIR` - default output directory for `.mtgx` files (default: `~/MaltegoGraphs`)
- `MALTEGO_MCP_LOOKUP_TIMEOUT_MS` - per-lookup timeout in ms (default: `30000`). Currently applied to `crt.sh` only; `whois`, `dns`, and `asn` use their underlying library defaults. Broader timeout plumbing is a known enhancement.

## Tools

**Graph authoring**
- `maltego_create_graph(name)` - returns graphId
- `maltego_add_entity(graphId, type, value, properties?, notes?)` - returns entityId
- `maltego_add_link(graphId, from, to, label?, properties?)` - returns linkId
- `maltego_save_graph(graphId, path, overwrite?)` - writes `.mtgx`
- `maltego_load_graph(path)` - parses existing `.mtgx` into a new handle

**Primitive lookups**
- `maltego_whois(domain)` - registrar, nameservers, dates
- `maltego_dns(domain)` - A/AAAA/MX/NS/TXT
- `maltego_asn(ip)` - Team Cymru ASN, prefix, country, org
- `maltego_crtsh(domain)` - certificate transparency entries

**Convenience**
- `maltego_expand_ip(ip, outputPath)` - IP + ASN + netblock, saved as `.mtgx`
- `maltego_expand_domain(domain, outputPath)` - domain + whois + DNS + ASN per A record
- `maltego_expand_hash(hash, outputPath, algorithm?)` - hash entity (extend in later versions)

## Entity types

Standard Maltego ontology: `IPv4Address`, `IPv6Address`, `Domain`, `URL`, `Hash`, `EmailAddress`, `Netblock`, `AS`, `Website`, `Company`, `Person`. For concepts without a standard type, use `Phrase` with a category prefix (`[T1566] Phishing`, `[TheHive] Case #42`).

## Composing with other MCPs

maltego-mcp does not embed third-party threat-intel clients. For MISP events, ATT&CK techniques, Cortex reports, etc., call the dedicated MCPs (`misp-mcp`, `mitre-mcp`, `cortex-mcp`, etc.) and pipe the results into `maltego_add_entity` / `maltego_add_link`.

## Development

```bash
npm test              # unit tests
npm run test:integration
npm run test:all
npm run typecheck
```

See `docs/superpowers/specs/` for design notes and `docs/superpowers/plans/` for implementation history.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with install, registration, tool reference"
```

---

## Task 22: Register the MCP server with both Claude clients

**Files:**
- Modify: `C:\Users\srnea\AppData\Roaming\Claude\claude_desktop_config.json`

- [ ] **Step 1: Register with Claude Code (user scope)**

Run:
```bash
claude mcp add --scope user maltego -- node "C:/Users/srnea/repos/maltego-mcp/dist/index.js"
```
Expected: `maltego` appears in `claude mcp list`.

- [ ] **Step 2: Update `claude_desktop_config.json`**

Add `mcpServers.maltego` to the existing file:

```json
{
  "preferences": {
    "coworkScheduledTasksEnabled": true,
    "ccdScheduledTasksEnabled": true,
    "sidebarMode": "epitaxy",
    "coworkWebSearchEnabled": true,
    "keepAwakeEnabled": true,
    "coworkOnboardingResumeStep": null,
    "bypassPermissionsModeEnabled": true,
    "autoPermissionsModeEnabled": true
  },
  "mcpServers": {
    "maltego": {
      "command": "node",
      "args": ["C:\\Users\\srnea\\repos\\maltego-mcp\\dist\\index.js"]
    }
  }
}
```

If `misp-mcp` is already in `mcpServers`, keep it and add `maltego` as a sibling key.

- [ ] **Step 3: Restart Claude Desktop and verify**

Close and reopen Claude Desktop. Confirm `maltego_*` tools appear in the MCP tool list.

- [ ] **Step 4: Smoke test from Claude**

From Claude Code or Desktop, ask Claude to run:
```
maltego_create_graph(name="smoke")
maltego_add_entity(graphId=<returned>, type="Domain", value="example.com")
maltego_save_graph(graphId=<returned>, path="~/MaltegoGraphs/smoke.mtgx")
```
Expected: `.mtgx` appears in `~/MaltegoGraphs/smoke.mtgx`. Open it in Maltego Desktop to visually confirm the graph renders.

- [ ] **Step 5: Commit client config if tracked elsewhere**

`claude_desktop_config.json` lives outside this repo, so do NOT commit it here. The registration step is manual and documented in `README.md`.

---

## Done

Phase A is complete. v1 artifacts:

- `dist/index.js` - built MCP server
- Registered in Claude Code + Claude Desktop configs
- `~/MaltegoGraphs/` default output directory
- Test coverage: graph library, lookups, tools, registry, errors, end-to-end round-trip, error propagation, expand convenience

**Next up (future plan):** Phase B - Python TRX transforms bundled into a `.mtz` file, imported into Maltego Desktop so Claude-backed transforms appear in the right-click menu. Covered by a separate plan.
