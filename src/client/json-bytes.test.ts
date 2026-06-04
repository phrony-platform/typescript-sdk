import { describe, expect, it } from "vitest";
import { jsonBytes, jsonBytesMap, parseJsonBytes, resolvedSecretsMap } from "./json-bytes.js";

describe("json-bytes helpers", () => {
  it("round-trips JSON objects", () => {
    const payload = { claimId: "CLM-48219", nested: { ok: true } };
    expect(parseJsonBytes<typeof payload>(jsonBytes(payload))).toEqual(payload);
  });

  it("encodes JSON maps for non-secret payloads", () => {
    const payload = jsonBytesMap({ nested: { ok: true } });
    expect(parseJsonBytes(payload.nested!)).toEqual({ ok: true });
  });

  it("encodes resolved secrets as raw UTF-8 (no JSON quotes)", () => {
    const secrets = resolvedSecretsMap({ openai: "sk-test" });
    expect(secrets.openai!.toString("utf8")).toBe("sk-test");
    expect(secrets.openai!.toString("utf8")).not.toMatch(/^"/);
  });

  it("rejects empty bytes", () => {
    expect(() => parseJsonBytes(Buffer.alloc(0))).toThrow("cannot parse empty bytes as JSON");
  });
});
