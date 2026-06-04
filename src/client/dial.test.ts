import { describe, expect, it } from "vitest";
import { DEFAULT_RUNTIME_ADDR, resolveRuntimeAddr } from "./dial.js";

describe("resolveRuntimeAddr", () => {
  it("prefers an explicit address", () => {
    expect(resolveRuntimeAddr("custom:9999")).toBe("custom:9999");
  });

  it("falls back to PHRONY_RUNTIME_ADDR", () => {
    const previous = process.env.PHRONY_RUNTIME_ADDR;
    process.env.PHRONY_RUNTIME_ADDR = "env:7777";
    try {
      expect(resolveRuntimeAddr()).toBe("env:7777");
    } finally {
      if (previous === undefined) {
        delete process.env.PHRONY_RUNTIME_ADDR;
      } else {
        process.env.PHRONY_RUNTIME_ADDR = previous;
      }
    }
  });

  it("uses the default when unset", () => {
    const previous = process.env.PHRONY_RUNTIME_ADDR;
    delete process.env.PHRONY_RUNTIME_ADDR;
    try {
      expect(resolveRuntimeAddr()).toBe(DEFAULT_RUNTIME_ADDR);
    } finally {
      if (previous === undefined) {
        delete process.env.PHRONY_RUNTIME_ADDR;
      } else {
        process.env.PHRONY_RUNTIME_ADDR = previous;
      }
    }
  });
});
