import type { AgentRef } from "./gen/phrony/runtime/v1/runtime.js";

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
  const [agentPart, versionPart, hasVersion] = splitAtFirst(s, "@");
  if (hasVersion && versionPart === "") {
    throw new AgentRefParseError(`agent version must not be empty after @ in ${JSON.stringify(s)}`);
  }

  const [namespace, name, hasSlash] = splitAtFirst(agentPart, "/");
  if (!hasSlash || namespace === "" || name === "") {
    throw new AgentRefParseError(`agent must be namespace/name, got ${JSON.stringify(s)}`);
  }

  return { namespace, name, version: hasVersion ? versionPart : "" };
}

/** Format an {@link AgentRef} as `namespace/name` or `namespace/name@version`. */
export function formatAgentRef(ref: AgentRef): string {
  const base = ref.namespace === "" ? ref.name : `${ref.namespace}/${ref.name}`;
  if (ref.version === "") {
    return base;
  }
  return `${base}@${ref.version}`;
}

function splitAtFirst(s: string, sep: string): [string, string, boolean] {
  const index = s.indexOf(sep);
  if (index === -1) {
    return [s, "", false];
  }
  return [s.slice(0, index), s.slice(index + sep.length), true];
}
