import { describe, it, expect } from "vitest";
import { validateEntityType, ENTITY_TYPES, isPhraseType } from "../../../src/graph/entities.js";

describe("validateEntityType", () => {
  it("accepts standard Maltego types", () => {
    expect(validateEntityType("maltego.IPv4Address")).toEqual({ ok: true });
    expect(validateEntityType("maltego.Domain")).toEqual({ ok: true });
    expect(validateEntityType("maltego.Phrase")).toEqual({ ok: true });
  });

  it("accepts bare type names (auto-prefixed)", () => {
    expect(validateEntityType("IPv4Address")).toEqual({ ok: true, normalized: "maltego.IPv4Address" });
    expect(validateEntityType("Domain")).toEqual({ ok: true, normalized: "maltego.Domain" });
  });

  it("rejects unknown types with suggestions", () => {
    const result = validateEntityType("IPv4");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.suggestions).toContain("maltego.IPv4Address");
    }
  });

  it("registry includes expected types", () => {
    expect(ENTITY_TYPES).toContain("maltego.IPv4Address");
    expect(ENTITY_TYPES).toContain("maltego.IPv6Address");
    expect(ENTITY_TYPES).toContain("maltego.Domain");
    expect(ENTITY_TYPES).toContain("maltego.URL");
    expect(ENTITY_TYPES).toContain("maltego.Hash");
    expect(ENTITY_TYPES).toContain("maltego.EmailAddress");
    expect(ENTITY_TYPES).toContain("maltego.Netblock");
    expect(ENTITY_TYPES).toContain("maltego.AS");
    expect(ENTITY_TYPES).toContain("maltego.Website");
    expect(ENTITY_TYPES).toContain("maltego.Company");
    expect(ENTITY_TYPES).toContain("maltego.Person");
    expect(ENTITY_TYPES).toContain("maltego.Phrase");
  });
});

describe("isPhraseType", () => {
  it("identifies phrase type variants", () => {
    expect(isPhraseType("maltego.Phrase")).toBe(true);
    expect(isPhraseType("Phrase")).toBe(true);
    expect(isPhraseType("maltego.Domain")).toBe(false);
  });
});
