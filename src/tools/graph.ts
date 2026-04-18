import { access } from "node:fs/promises";
import { GraphRegistry } from "../server/registry.js";
import { writeMtgxFile } from "../graph/writer.js";
import { readMtgxFile } from "../graph/reader.js";
import { ToolFileSystemError, ToolValidationError } from "../server/errors.js";
import { confineToOutputDir } from "../server/paths.js";
import { randomUUID } from "node:crypto";

export interface CreateGraphInput { name: string; }
export interface AddEntityInput {
  graphId: string;
  type: string;
  value: string;
  properties?: Record<string, string>;
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

export function graphToolHandlers(reg: GraphRegistry, config: { outputDir: string }) {
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
        properties: input.properties ?? {}
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
      const resolved = confineToOutputDir(input.path, config.outputDir);
      if (!input.overwrite && (await pathExists(resolved))) {
        throw new ToolFileSystemError(
          `file already exists, refusing to overwrite (pass overwrite=true): ${resolved}`,
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
      const resolved = confineToOutputDir(input.path, config.outputDir);
      const newId = `g-${randomUUID().slice(0, 8)}`;
      const g = await readMtgxFile(resolved, newId);
      reg.register(g);
      return { graphId: g.id, entityCount: g.entityCount(), linkCount: g.linkCount() };
    }
  };
}

export type GraphTools = ReturnType<typeof graphToolHandlers>;
