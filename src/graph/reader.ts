import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { Graph } from "./graph.js";

export const MTGX_LIMITS = {
  maxArchiveBytes: 10 * 1024 * 1024,
  maxEntries: 32,
  maxGraphmlBytes: 1024 * 1024,
  maxCompressionRatio: 100,
  maxNodes: 10_000,
  maxEdges: 20_000,
  maxStringLength: 8_192,
};

export async function readMtgxBytes(bytes: Uint8Array | Buffer, newGraphId: string): Promise<Graph> {
  if (bytes.byteLength > MTGX_LIMITS.maxArchiveBytes) throw new Error("resource limit: archive exceeds byte ceiling");
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch (err) {
    throw new Error(`failed to parse .mtgx zip: ${(err as Error).message}`);
  }
  const entries = Object.values(zip.files);
  if (entries.length > MTGX_LIMITS.maxEntries) throw new Error("resource limit: too many archive entries");
  const file = zip.file("Graphs/Graph1.graphml");
  if (!file) {
    throw new Error("missing Graphs/Graph1.graphml in .mtgx archive");
  }
  if ((file as any)._data?.uncompressedSize > MTGX_LIMITS.maxGraphmlBytes) throw new Error("resource limit: GraphML exceeds byte ceiling");
  if ((file as any)._data?.compressedSize && (file as any)._data.uncompressedSize / (file as any)._data.compressedSize > MTGX_LIMITS.maxCompressionRatio) throw new Error("resource limit: GraphML compression ratio exceeds ceiling");
  const xmlBytes = await file.async("uint8array");
  if (xmlBytes.byteLength > MTGX_LIMITS.maxGraphmlBytes) throw new Error("resource limit: GraphML exceeds byte ceiling");
  const xml = new TextDecoder().decode(xmlBytes);
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", processEntities: false });
  const parsed = parser.parse(xml);
  const gml = parsed.graphml?.graph;
  if (!gml) {
    throw new Error("no graphml/graph element in .mtgx");
  }

  const graph = new Graph(newGraphId, "imported");
  const idMap = new Map<string, string>();
  const nodes = gml.node ? (Array.isArray(gml.node) ? gml.node : [gml.node]) : [];
  if (nodes.length > MTGX_LIMITS.maxNodes) throw new Error("resource limit: too many nodes");
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
      if (String(name ?? "").length > MTGX_LIMITS.maxStringLength || val.length > MTGX_LIMITS.maxStringLength) throw new Error("resource limit: GraphML string too long");
      if (name === "properties.value") {
        value = val;
      } else if (name) {
        properties[name] = val;
      }
    }
    // find the graphics data entry (has y:ShapeNode)
    const graphicsData = dataEntries.find((d: any) => d["y:ShapeNode"]);
    const geometry = graphicsData?.["y:ShapeNode"]?.["y:Geometry"];
    let position: { x: number; y: number } | undefined;
    if (geometry) {
      const x = Number(geometry["@_x"]);
      const y = Number(geometry["@_y"]);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        position = { x, y };
      }
    }
    const added = graph.addEntity({ type, value, properties, position });
    idMap.set(oldId, added.id);
  }

  const edges = gml.edge ? (Array.isArray(gml.edge) ? gml.edge : [gml.edge]) : [];
  if (edges.length > MTGX_LIMITS.maxEdges) throw new Error("resource limit: too many edges");
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
      if (String(name ?? "").length > MTGX_LIMITS.maxStringLength || val.length > MTGX_LIMITS.maxStringLength) throw new Error("resource limit: GraphML string too long");
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
  const { readFile, lstat } = await import("node:fs/promises");
  if ((await lstat(path)).isSymbolicLink()) throw new Error("refusing to read symlinked .mtgx file");
  const bytes = await readFile(path);
  return readMtgxBytes(bytes, newGraphId);
}
