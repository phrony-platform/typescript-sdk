/** Encode a JSON-serializable value as proto `bytes` (UTF-8 JSON). */
export function jsonBytes(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value), "utf8");
}

/** Parse proto `bytes` that contain UTF-8 JSON into a typed value. */
export function parseJsonBytes<T>(bytes: Uint8Array | Buffer): T {
  const text = Buffer.from(bytes).toString("utf8");
  if (text.length === 0) {
    throw new Error("cannot parse empty bytes as JSON");
  }
  return JSON.parse(text) as T;
}

/** Encode a map of secret names to JSON-serializable values as proto `bytes` entries. */
export function jsonBytesMap(values: Record<string, unknown>): Record<string, Buffer> {
  const out: Record<string, Buffer> = {};
  for (const [key, value] of Object.entries(values)) {
    out[key] = jsonBytes(value);
  }
  return out;
}

/**
 * Encode resolved manifest secrets as raw UTF-8 bytes (matches `phrony run` / fromEnv).
 * Do not use {@link jsonBytesMap} for API keys — JSON quoting breaks provider auth.
 */
export function resolvedSecretsMap(
  values: Record<string, string | Uint8Array>,
): Record<string, Buffer> {
  const out: Record<string, Buffer> = {};
  for (const [key, value] of Object.entries(values)) {
    out[key] = typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.from(value);
  }
  return out;
}
