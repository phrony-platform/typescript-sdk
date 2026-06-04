import { describe, expect, it } from "vitest";
import {
  AgentRefParseError,
  formatAgentRef,
  parseAgentRef,
} from "./agent-ref.js";

describe("parseAgentRef", () => {
  it("parses namespace/name", () => {
    expect(parseAgentRef("demo/echo-agent")).toEqual({
      namespace: "demo",
      name: "echo-agent",
      version: "",
    });
  });

  it("parses namespace/name@version", () => {
    expect(parseAgentRef("demo/echo-agent@1.2.0")).toEqual({
      namespace: "demo",
      name: "echo-agent",
      version: "1.2.0",
    });
  });

  it.each(["", "echo-agent", "/echo", "demo/", "demo/echo-agent@"])(
    "rejects invalid reference %s",
    (ref) => {
      expect(() => parseAgentRef(ref)).toThrow(AgentRefParseError);
    },
  );
});

describe("formatAgentRef", () => {
  it("formats without version", () => {
    expect(
      formatAgentRef({ namespace: "demo", name: "echo", version: "" }),
    ).toBe("demo/echo");
  });

  it("formats with version", () => {
    expect(
      formatAgentRef({ namespace: "demo", name: "echo", version: "1.0.0" }),
    ).toBe("demo/echo@1.0.0");
  });

  it("round-trips parsed refs", () => {
    const ref = parseAgentRef("default/my-agent@0.2.0");
    expect(formatAgentRef(ref)).toBe("default/my-agent@0.2.0");
  });
});
