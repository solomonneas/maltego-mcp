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
