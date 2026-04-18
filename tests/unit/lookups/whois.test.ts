import { describe, it, expect, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { whoisLookup } from "../../../src/lookups/whois.js";

vi.mock("whois", () => ({
  default: {
    lookup: (domain: string, cb: (err: Error | null, data: string) => void) => {
      readFile(resolve(__dirname, "../../../fixtures/responses/whois-example.com.txt"), "utf8")
        .then((data) => cb(null, data));
    }
  }
}));

describe("whoisLookup", () => {
  it("parses registrar, nameservers, creation, expiry", async () => {
    const result = await whoisLookup("example.com");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.registrar).toMatch(/IANA/);
      expect(result.data.nameservers).toContain("A.IANA-SERVERS.NET");
      expect(result.data.nameservers).toContain("B.IANA-SERVERS.NET");
      expect(result.data.creationDate).toBeDefined();
      expect(result.data.registryExpiryDate).toBeDefined();
    }
  });
});
