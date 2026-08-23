import { lookup as whoisLookupFn } from "whois";
import type { LookupOutcome } from "../types.js";

export interface WhoisData {
  domain: string;
  evidence: "untrusted-network-data";
  registrar?: string;
  nameservers: string[];
  creationDate?: string;
  updatedDate?: string;
  registryExpiryDate?: string;
}

const MAX_WHOIS_BYTES = 64 * 1024;
const MAX_FIELD_LENGTH = 1024;
const MAX_NAMESERVERS = 32;

function validDomain(domain: string): boolean {
  return domain.length <= 253 && /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(domain);
}

function extract(line: RegExp, text: string): string | undefined {
  const m = text.match(line);
  return m ? m[1].trim() : undefined;
}

function extractAll(line: RegExp, text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(line)) {
    out.push(match[1].trim());
  }
  return out;
}

export function whoisLookup(domain: string, timeoutMs = 30_000): Promise<LookupOutcome<WhoisData>> {
  if (!validDomain(domain)) return Promise.resolve({ ok: false, error: "invalid domain", retriable: false });
  return new Promise((resolvePromise) => {
    const timer = setTimeout(() => resolvePromise({ ok: false, error: "whois lookup deadline exceeded", retriable: true }), timeoutMs);
    const callback = (err: Error | null, data: string) => {
      clearTimeout(timer);
      if (err) {
        resolvePromise({
          ok: false,
          error: `whois lookup failed: ${err.message}`,
          retriable: true
        });
        return;
      }
      const text = (data ?? "").slice(0, MAX_WHOIS_BYTES);
      if ((data ?? "").length > MAX_WHOIS_BYTES) { resolvePromise({ ok: false, error: "resource limit: whois response too large", retriable: true }); return; }
      const limit = (value: string | undefined) => value?.slice(0, MAX_FIELD_LENGTH);
      resolvePromise({
        ok: true,
        data: {
          domain,
          evidence: "untrusted-network-data",
          registrar: limit(extract(/^\s*Registrar:\s*(.+)$/im, text)),
          nameservers: extractAll(/^\s*Name Server:\s*(.+)$/gim, text).slice(0, MAX_NAMESERVERS).map((s) => s.slice(0, MAX_FIELD_LENGTH).toUpperCase()),
          creationDate: limit(extract(/^\s*Creation Date:\s*(.+)$/im, text)),
          updatedDate: limit(extract(/^\s*Updated Date:\s*(.+)$/im, text)),
          registryExpiryDate: limit(extract(/^\s*Registry Expiry Date:\s*(.+)$/im, text))
        }
      });
    };
    // The package accepts options, while older test doubles expose the legacy two-argument form.
    if (whoisLookupFn.length >= 3) whoisLookupFn(domain, { timeout: timeoutMs }, callback);
    else (whoisLookupFn as unknown as (name: string, cb: typeof callback) => void)(domain, callback);
  });
}
