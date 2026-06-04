import { status as grpcStatus } from "@grpc/grpc-js";
import { describe, expect, it, vi } from "vitest";
import { PhronyRuntimeError } from "./errors.js";
import { callUnary } from "./unary.js";

describe("callUnary", () => {
  it("resolves when the RPC succeeds", async () => {
    const method = vi.fn((_req: { id: string }, callback: (err: null, res: { ok: boolean }) => void) => {
      callback(null, { ok: true });
    });

    await expect(callUnary("test rpc", method, { id: "1" })).resolves.toEqual({ ok: true });
    expect(method).toHaveBeenCalledWith({ id: "1" }, expect.any(Function));
  });

  it("rejects with PhronyRuntimeError when the RPC fails", async () => {
    const method = vi.fn((_req: object, callback: (err: object, res: null) => void) => {
      callback(
        {
          code: grpcStatus.INVALID_ARGUMENT,
          details: "bad request",
          metadata: {},
          name: "Error",
          message: "bad request",
        },
        null,
      );
    });

    await expect(callUnary("test rpc", method, {})).rejects.toBeInstanceOf(PhronyRuntimeError);
  });
});
