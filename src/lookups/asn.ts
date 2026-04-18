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
