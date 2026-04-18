import { describe, it, expect, vi } from "vitest";
import { lookupToolHandlers } from "../../../src/tools/lookups.js";

vi.mock("../../../src/lookups/whois.js", () => ({
  whoisLookup: vi.fn().mockResolvedValue({
    ok: true,
    data: { domain: "example.com", raw: "...", registrar: "IANA", nameservers: ["NS1"] }
  })
}));
vi.mock("../../../src/lookups/dns.js", () => ({
  dnsLookup: vi.fn().mockResolvedValue({
    ok: true,
    data: { domain: "example.com", a: ["1.2.3.4"], aaaa: [], mx: [], ns: [], txt: [] }
  })
}));
vi.mock("../../../src/lookups/asn.js", () => ({
  asnLookup: vi.fn().mockResolvedValue({
    ok: true,
    data: { ip: "1.2.3.4", asn: 15169, prefix: "8.8.8.0/24", country: "US", registry: "arin", allocated: "1992-12-01" }
  })
}));
vi.mock("../../../src/lookups/crtsh.js", () => ({
  crtshLookup: vi.fn().mockResolvedValue({ ok: true, data: { domain: "example.com", certs: [] } })
}));

describe("lookup tools", () => {
  const tools = lookupToolHandlers();

  it("maltego_whois returns parsed data", async () => {
    const r = await tools.maltego_whois({ domain: "example.com" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.registrar).toBe("IANA");
  });

  it("maltego_dns returns A records", async () => {
    const r = await tools.maltego_dns({ domain: "example.com" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.a).toContain("1.2.3.4");
  });

  it("maltego_asn returns ASN data", async () => {
    const r = await tools.maltego_asn({ ip: "1.2.3.4" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.asn).toBe(15169);
  });

  it("maltego_crtsh returns cert entries", async () => {
    const r = await tools.maltego_crtsh({ domain: "example.com" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.certs).toEqual([]);
  });
});
