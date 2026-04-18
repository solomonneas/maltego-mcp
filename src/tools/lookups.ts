import { whoisLookup } from "../lookups/whois.js";
import { dnsLookup } from "../lookups/dns.js";
import { asnLookup } from "../lookups/asn.js";
import { crtshLookup } from "../lookups/crtsh.js";

export function lookupToolHandlers(config?: { lookupTimeoutMs?: number }) {
  const timeoutMs = config?.lookupTimeoutMs ?? 30_000;
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
      return crtshLookup(input.domain, timeoutMs);
    }
  };
}

export type LookupTools = ReturnType<typeof lookupToolHandlers>;
