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
