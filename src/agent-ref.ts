import type { AgentRef } from "./gen/phrony/runtime/v1/runtime.js";
import { parseNamespacedRef } from "./ref-parse.js";

/** Error thrown when an agent reference string cannot be parsed. */
export class AgentRefParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentRefParseError";
  }
}

/**
 * Parse a CLI-style agent reference (`namespace/name` or `namespace/name@version`)
 * into a proto {@link AgentRef}.
 */
export function parseAgentRef(s: string): AgentRef {
  return parseNamespacedRef(s, "agent", AgentRefParseError);
}

/** Format an {@link AgentRef} as `namespace/name` or `namespace/name@version`. */
export function formatAgentRef(ref: AgentRef): string {
  const base = ref.namespace === "" ? ref.name : `${ref.namespace}/${ref.name}`;
  if (ref.version === "") {
    return base;
  }
  return `${base}@${ref.version}`;
}
