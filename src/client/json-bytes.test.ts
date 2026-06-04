import { describe, expect, it } from "vitest";
import { jsonBytes, jsonBytesMap, parseJsonBytes } from "./json-bytes.js";

describe("json-bytes helpers", () => {
  it("round-trips JSON objects", () => {
    const payload = { claimId: "CLM-48219", nested: { ok: true } };
    expect(parseJsonBytes<typeof payload>(jsonBytes(payload))).toEqual(payload);
  });

  it("encodes secret maps", () => {
    const secrets = jsonBytesMap({ "secrets.api_key": "abc123" });
    expect(parseJsonBytes<string>(secrets["secrets.api_key"]!)).toBe("abc123");
  });

  it("rejects empty bytes", () => {
    expect(() => parseJsonBytes(Buffer.alloc(0))).toThrow("cannot parse empty bytes as JSON");
  });
});
