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

const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_CERTS = 1_000;
const MAX_FIELD_LENGTH = 4_096;

function validDomain(domain: string): boolean {
  return domain.length <= 253 && /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(domain);
}

export async function crtshLookup(domain: string, timeoutMs: number = 30_000): Promise<LookupOutcome<CrtshData>> {
  if (!validDomain(domain)) return { ok: false, error: "invalid domain", retriable: false };
  const url = `https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`;
  let res;
  try {
    res = await request(url, { method: "GET", headersTimeout: timeoutMs, bodyTimeout: timeoutMs, maxRedirections: 0 });
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

  const chunks: Buffer[] = [];
  let received = 0;
  try {
    for await (const chunk of res.body) {
      received += chunk.length;
      if (received > MAX_RESPONSE_BYTES) { res.body.destroy(); return { ok: false, error: "resource limit: crt.sh response too large", retriable: true }; }
      chunks.push(chunk);
    }
  } catch (err) { return { ok: false, error: `crt.sh body failed: ${(err as Error).message}`, retriable: true }; }
  let rows: Array<{
    id: number;
    common_name: string;
    issuer_name: string;
    name_value: string;
    not_before: string;
    not_after: string;
    serial_number: string;
    entry_timestamp: string;
  }>;
  try { rows = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return { ok: false, error: "crt.sh returned invalid JSON", retriable: false }; }
  if (!Array.isArray(rows)) return { ok: false, error: "crt.sh returned invalid JSON", retriable: false };

  return {
    ok: true,
    data: {
      domain,
      certs: rows.slice(0, MAX_CERTS).map((r) => ({
        id: r.id,
        commonName: String(r.common_name ?? "").slice(0, MAX_FIELD_LENGTH),
        issuer: String(r.issuer_name ?? "").slice(0, MAX_FIELD_LENGTH),
        sans: String(r.name_value ?? "").split("\n").filter((s) => s.length > 0).slice(0, 100).map((s) => s.slice(0, MAX_FIELD_LENGTH)),
        notBefore: String(r.not_before ?? "").slice(0, MAX_FIELD_LENGTH),
        notAfter: String(r.not_after ?? "").slice(0, MAX_FIELD_LENGTH),
        serialNumber: String(r.serial_number ?? "").slice(0, MAX_FIELD_LENGTH),
        entryTimestamp: String(r.entry_timestamp ?? "").slice(0, MAX_FIELD_LENGTH)
      }))
    }
  };
}
