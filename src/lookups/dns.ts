import { resolve4, resolve6, resolveMx, resolveNs, resolveTxt } from "node:dns/promises";
import type { LookupOutcome } from "../types.js";

export interface DnsData {
  domain: string;
  a: string[];
  aaaa: string[];
  mx: { exchange: string; priority: number }[];
  ns: string[];
  txt: string[];
  warnings?: string[];
}

async function safe<T>(promise: Promise<T>, fallback: T): Promise<{ value: T; error?: string }> {
  try {
    return { value: await promise };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENODATA" || code === "ENOTFOUND") return { value: fallback };
    return { value: fallback, error: code ?? (err as Error).message };
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
    const results = [a, aaaa, mx, ns, txt];
    if (results.every((result) => result.error)) return { ok: false, error: `dns lookup operational failure: ${results.map((r) => r.error).join(", ")}`, retriable: true };
    const warnings = results.flatMap((result) => result.error ? [`DNS query failed: ${result.error}`] : []);
    return {
      ok: true,
      data: {
        domain,
        a: a.value,
        aaaa: aaaa.value,
        mx: mx.value,
        ns: ns.value,
        txt: txt.value.flat(),
        ...(warnings.length ? { warnings } : {})
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
