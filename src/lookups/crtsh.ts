import { request } from "undici";
import type { LookupOutcome } from "../types.js";

export interface CrtshCert {
  id: number;
  commonName: string;
  issuer: string;
  sans: string[];
  notBefore: string;
  notAfter: string;
  serialNumber: string;
  entryTimestamp: string;
}

export interface CrtshData {
  domain: string;
  certs: CrtshCert[];
}

export async function crtshLookup(domain: string, timeoutMs: number = 30_000): Promise<LookupOutcome<CrtshData>> {
  const url = `https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`;
  let res;
  try {
    res = await request(url, { method: "GET", headersTimeout: timeoutMs, bodyTimeout: timeoutMs });
  } catch (err) {
    return {
      ok: false,
      error: `crt.sh request failed: ${(err as Error).message}`,
      retriable: true
    };
  }

  if (res.statusCode === 429) {
    const ra = res.headers["retry-after"];
    const seconds = typeof ra === "string" ? parseInt(ra, 10) : NaN;
    return {
      ok: false,
      error: "crt.sh rate limited",
      retriable: true,
      retryAfterMs: Number.isFinite(seconds) ? seconds * 1000 : timeoutMs
    };
  }
  if (res.statusCode >= 400) {
    return {
      ok: false,
      error: `crt.sh returned ${res.statusCode}`,
      retriable: res.statusCode >= 500
    };
  }

  const rows = (await res.body.json()) as Array<{
    id: number;
    common_name: string;
    issuer_name: string;
    name_value: string;
    not_before: string;
    not_after: string;
    serial_number: string;
    entry_timestamp: string;
  }>;

  return {
    ok: true,
    data: {
      domain,
      certs: rows.map((r) => ({
        id: r.id,
        commonName: r.common_name,
        issuer: r.issuer_name,
        sans: r.name_value.split("\n").filter((s) => s.length > 0),
        notBefore: r.not_before,
        notAfter: r.not_after,
        serialNumber: r.serial_number,
        entryTimestamp: r.entry_timestamp
      }))
    }
  };
}
