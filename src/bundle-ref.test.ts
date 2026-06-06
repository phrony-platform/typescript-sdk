import { describe, expect, it } from "vitest";
import {
  BundleRefParseError,
  formatBundleRef,
  parseBundleRef,
  parseBundleRefVersionRequired,
} from "./bundle-ref.js";

describe("parseBundleRef", () => {
  it("parses namespace/name", () => {
    expect(parseBundleRef("demo/payment-desk")).toEqual({
      namespace: "demo",
      name: "payment-desk",
      version: "",
    });
  });

  it("parses namespace/name@semver", () => {
    expect(parseBundleRef("demo/payment-desk@1.2.0")).toEqual({
      namespace: "demo",
      name: "payment-desk",
      version: "1.2.0",
    });
  });

  it("parses namespace/name@sha256 lock hash", () => {
    const hash = "sha256:abcdef0123456789";
    expect(parseBundleRef(`demo/payment-desk@${hash}`)).toEqual({
      namespace: "demo",
      name: "payment-desk",
      version: hash,
    });
  });

  it.each(["", "payment-desk", "/payment", "demo/", "demo/payment-desk@"])(
    "rejects invalid reference %s",
    (ref) => {
      expect(() => parseBundleRef(ref)).toThrow(BundleRefParseError);
    },
  );
});

describe("parseBundleRefVersionRequired", () => {
  it("accepts refs with a version", () => {
    expect(parseBundleRefVersionRequired("demo/payment-desk@1.0.0")).toEqual({
      namespace: "demo",
      name: "payment-desk",
      version: "1.0.0",
    });
  });

  it("rejects refs without a version", () => {
    expect(() => parseBundleRefVersionRequired("demo/payment-desk")).toThrow(
      BundleRefParseError,
    );
  });
});

describe("formatBundleRef", () => {
  it("formats without version", () => {
    expect(
      formatBundleRef({ namespace: "demo", name: "payment-desk", version: "" }),
    ).toBe("demo/payment-desk");
  });

  it("formats with version", () => {
    expect(
      formatBundleRef({ namespace: "demo", name: "payment-desk", version: "1.0.0" }),
    ).toBe("demo/payment-desk@1.0.0");
  });

  it("round-trips parsed refs", () => {
    const ref = parseBundleRef("default/my-bundle@sha256:abc123");
    expect(formatBundleRef(ref)).toBe("default/my-bundle@sha256:abc123");
  });
});
