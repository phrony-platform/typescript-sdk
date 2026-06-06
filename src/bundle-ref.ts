import type { BundleRef } from "./gen/phrony/runtime/v1/runtime.js";
import { parseNamespacedRef } from "./ref-parse.js";

/** Error thrown when a bundle reference string cannot be parsed. */
export class BundleRefParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BundleRefParseError";
  }
}

/**
 * Parse a CLI-style bundle reference (`namespace/name` or `namespace/name@version`)
 * into a proto {@link BundleRef}. Version may be semver or a lock hash (`sha256:…`).
 */
export function parseBundleRef(s: string): BundleRef {
  return parseNamespacedRef(s, "bundle", BundleRefParseError);
}

/** Format a {@link BundleRef} as `namespace/name` or `namespace/name@version`. */
export function formatBundleRef(ref: BundleRef): string {
  const base = ref.namespace === "" ? ref.name : `${ref.namespace}/${ref.name}`;
  if (ref.version === "") {
    return base;
  }
  return `${base}@${ref.version}`;
}

/**
 * Parse a bundle reference and require a non-empty `@version` (semver or lock hash).
 * Use for deploy-by-hash flows.
 */
export function parseBundleRefVersionRequired(s: string): BundleRef {
  const ref = parseBundleRef(s);
  if (ref.version === "") {
    throw new BundleRefParseError(
      `bundle reference must include @version (semver or lock hash), got ${JSON.stringify(s)}`,
    );
  }
  return ref;
}
