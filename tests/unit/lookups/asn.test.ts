import { describe, it, expect, vi } from "vitest";
import { asnLookup } from "../../../src/lookups/asn.js";

vi.mock("node:dns/promises", () => ({
  resolveTxt: vi.fn().mockImplementation((host: string) => {
    if (host === "4.3.2.1.origin.asn.cymru.com") {
      return Promise.resolve([["15169 | 8.8.8.0/24 | US | arin | 1992-12-01"]]);
    }
    if (host === "AS15169.asn.cymru.com") {
      return Promise.resolve([["15169 | US | arin | 2000-03-30 | GOOGLE, US"]]);
    }
    return Promise.reject(new Error("NXDOMAIN"));
  })
}));

describe("asnLookup", () => {
  it("returns ASN, prefix, registry, org for an IPv4", async () => {
    const result = await asnLookup("1.2.3.4");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.asn).toBe(15169);
      expect(result.data.prefix).toBe("8.8.8.0/24");
      expect(result.data.country).toBe("US");
      expect(result.data.registry).toBe("arin");
      expect(result.data.organization).toMatch(/GOOGLE/);
    }
  });
});
