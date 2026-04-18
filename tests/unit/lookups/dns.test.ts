import { describe, it, expect, vi } from "vitest";
import { dnsLookup } from "../../../src/lookups/dns.js";

vi.mock("node:dns/promises", () => ({
  resolve4: vi.fn().mockResolvedValue(["93.184.216.34"]),
  resolve6: vi.fn().mockResolvedValue(["2606:2800:220:1:248:1893:25c8:1946"]),
  resolveMx: vi.fn().mockResolvedValue([{ exchange: "mail.example.com", priority: 10 }]),
  resolveNs: vi.fn().mockResolvedValue(["a.iana-servers.net", "b.iana-servers.net"]),
  resolveTxt: vi.fn().mockResolvedValue([["v=spf1 -all"]])
}));

describe("dnsLookup", () => {
  it("returns A, AAAA, MX, NS, TXT records", async () => {
    const result = await dnsLookup("example.com");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.a).toContain("93.184.216.34");
      expect(result.data.aaaa).toContain("2606:2800:220:1:248:1893:25c8:1946");
      expect(result.data.mx).toHaveLength(1);
      expect(result.data.mx[0].exchange).toBe("mail.example.com");
      expect(result.data.ns).toContain("a.iana-servers.net");
      expect(result.data.txt).toContain("v=spf1 -all");
    }
  });
});
