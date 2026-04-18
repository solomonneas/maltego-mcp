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
