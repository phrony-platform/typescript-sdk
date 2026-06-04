import { status as grpcStatus } from "@grpc/grpc-js";
import { describe, expect, it } from "vitest";
import { PhronyRuntimeError, wrapRpcError } from "./errors.js";

describe("PhronyRuntimeError", () => {
  it("formats standard gRPC failures", () => {
    const err = new PhronyRuntimeError("run session", {
      code: grpcStatus.NOT_FOUND,
      details: "agent not found",
      metadata: {},
      name: "Error",
      message: "agent not found",
    });

    expect(err).toBeInstanceOf(PhronyRuntimeError);
    expect(err.message).toBe("run session: agent not found (NOT_FOUND)");
    expect(err.grpcCode).toBe("NOT_FOUND");
    expect(err.action).toBe("run session");
  });

  it("marks UNIMPLEMENTED distinctly", () => {
    const err = new PhronyRuntimeError("publish agent", {
      code: grpcStatus.UNIMPLEMENTED,
      details: "Publish is disabled",
      metadata: {},
      name: "Error",
      message: "Publish is disabled",
    });

    expect(err.message).toBe(
      "publish agent: Publish is disabled (not implemented on this runtime yet)",
    );
  });

  it("wraps non-gRPC errors", () => {
    const err = wrapRpcError("connect", new Error("ECONNREFUSED"));
    expect(err.message).toBe("connect: ECONNREFUSED");
    expect(err.grpcCode).toBe("UNKNOWN");
  });
});
