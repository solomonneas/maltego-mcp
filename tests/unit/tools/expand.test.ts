import { describe, it, expect, vi, beforeEach } from "vitest";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { GraphRegistry } from "../../../src/server/registry.js";
import { expandToolHandlers } from "../../../src/tools/expand.js";

vi.mock("../../../src/lookups/whois.js", () => ({
  whoisLookup: vi.fn().mockResolvedValue({
    ok: true,
    data: { domain: "evil.example", raw: "", registrar: "BadCorp", nameservers: ["NS1.BAD"] }
  })
}));
vi.mock("../../../src/lookups/dns.js", () => ({
  dnsLookup: vi.fn().mockResolvedValue({
    ok: true,
    data: { domain: "evil.example", a: ["9.9.9.9"], aaaa: [], mx: [], ns: [], txt: [] }
  })
}));
vi.mock("../../../src/lookups/asn.js", () => ({
  asnLookup: vi.fn().mockResolvedValue({
    ok: true,
    data: { ip: "9.9.9.9", asn: 64512, prefix: "9.9.9.0/24", country: "US", registry: "arin", allocated: "2020-01-01", organization: "EVIL" }
  })
}));

describe("maltego_expand_domain", () => {
  let reg: GraphRegistry;
  let tmp: string;
  beforeEach(async () => {
    reg = new GraphRegistry();
    tmp = await mkdtemp(join(tmpdir(), "maltego-expand-"));
  });

  it("builds a graph with the domain, whois phrase, DNS IPs, and ASN", async () => {
    const tools = expandToolHandlers(reg, { outputDir: tmp });
    const out = join(tmp, "evil.mtgx");
    const result = await tools.maltego_expand_domain({ domain: "evil.example", outputPath: out });
    expect(result.entityCount).toBeGreaterThanOrEqual(3);
    expect(result.linkCount).toBeGreaterThanOrEqual(2);
    const g = reg.getOrThrow(result.graphId);
    const values = g.allEntities().map((e) => e.value);
    expect(values).toContain("evil.example");
    expect(values).toContain("9.9.9.9");
    await rm(tmp, { recursive: true, force: true });
  });
});
