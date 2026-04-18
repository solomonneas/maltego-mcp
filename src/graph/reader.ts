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
