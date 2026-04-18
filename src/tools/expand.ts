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
