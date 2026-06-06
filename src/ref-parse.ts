export function splitAtFirst(s: string, sep: string): [string, string, boolean] {
  const index = s.indexOf(sep);
  if (index === -1) {
    return [s, "", false];
  }
  return [s.slice(0, index), s.slice(index + sep.length), true];
}

export type NamespacedRef = {
  namespace: string;
  name: string;
  version: string;
};

/** Parse `namespace/name` or `namespace/name@version` into namespace, name, and version. */
export function parseNamespacedRef(
  s: string,
  label: string,
  ParseError: new (message: string) => Error,
): NamespacedRef {
  const [resourcePart, versionPart, hasVersion] = splitAtFirst(s, "@");
  if (hasVersion && versionPart === "") {
    throw new ParseError(`${label} version must not be empty after @ in ${JSON.stringify(s)}`);
  }

  const [namespace, name, hasSlash] = splitAtFirst(resourcePart, "/");
  if (!hasSlash || namespace === "" || name === "") {
    throw new ParseError(`${label} must be namespace/name, got ${JSON.stringify(s)}`);
  }

  return { namespace, name, version: hasVersion ? versionPart : "" };
}
