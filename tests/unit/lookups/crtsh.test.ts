import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher, Dispatcher } from "undici";
import { crtshLookup } from "../../../src/lookups/crtsh.js";

let originalDispatcher: Dispatcher;
let mockAgent: MockAgent;

beforeEach(() => {
  originalDispatcher = getGlobalDispatcher();
  mockAgent = new MockAgent();
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);
});

afterEach(async () => {
  await mockAgent.close();
  setGlobalDispatcher(originalDispatcher);
});

describe("crtshLookup", () => {
  it("parses cert entries for a domain", async () => {
    const fixture = await readFile(
      resolve(__dirname, "../../../fixtures/responses/crtsh-example.com.json"),
      "utf8"
    );
    mockAgent
      .get("https://crt.sh")
      .intercept({ path: "/?q=example.com&output=json" })
      .reply(200, fixture, { headers: { "content-type": "application/json" } });

    const result = await crtshLookup("example.com");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.certs).toHaveLength(1);
      expect(result.data.certs[0].commonName).toBe("www.example.com");
      expect(result.data.certs[0].sans).toContain("*.example.com");
      expect(result.data.certs[0].sans).toContain("example.com");
    }
  });

  it("returns retriable error on 429", async () => {
    mockAgent
      .get("https://crt.sh")
      .intercept({ path: "/?q=example.com&output=json" })
      .reply(429, "", { headers: { "retry-after": "60" } });

    const result = await crtshLookup("example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.retriable).toBe(true);
      expect(result.retryAfterMs).toBe(60_000);
    }
  });
});
