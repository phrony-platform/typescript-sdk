import { EventEmitter } from "node:events";
import { status as grpcStatus } from "@grpc/grpc-js";
import { describe, expect, it, vi } from "vitest";
import { RuntimeService } from "../gen/phrony/runtime/v1/runtime.js";
import { InteractiveSession } from "../session/interactive-session.js";
import { PhronyRuntimeError } from "./errors.js";
import { RuntimeClient } from "./runtime-client.js";

const UNARY_METHODS = [
  "getVersion",
  "runSession",
  "publish",
  "deploy",
  "rollback",
  "getActiveVersion",
  "listDeployments",
  "getAgentVersion",
  "retireAgentVersion",
  "cancelSession",
  "completeSession",
  "listAgents",
  "listAgentVersions",
  "listSessions",
  "getApproval",
  "listApprovals",
  "decideApproval",
  "deprecateAgentVersion",
  "archiveAgent",
] as const;

function createMockGrpcClient() {
  const unaryMocks = Object.fromEntries(
    UNARY_METHODS.map((name) => [name, vi.fn()]),
  ) as Record<(typeof UNARY_METHODS)[number], ReturnType<typeof vi.fn>>;

  return {
    ...unaryMocks,
    work: vi.fn(() => ({ kind: "work-stream" })),
    runSessionInteractive: vi.fn(() =>
      Object.assign(new EventEmitter(), {
        write: vi.fn(),
        end: vi.fn(),
      }),
    ),
    close: vi.fn(),
  };
}

function createMockHealthClient() {
  return { close: vi.fn() };
}

function createClientForTest(
  grpc: ReturnType<typeof createMockGrpcClient>,
  health: ReturnType<typeof createMockHealthClient>,
): RuntimeClient {
  return Reflect.construct(RuntimeClient, [grpc, health, "127.0.0.1:7777"]);
}

describe("RuntimeClient", () => {
  it("exposes all generated unary RPCs", () => {
    expect(Object.keys(RuntimeService)).toHaveLength(21);
    for (const method of UNARY_METHODS) {
      expect(RuntimeService[method]).toBeDefined();
      expect(typeof RuntimeClient.prototype[method]).toBe("function");
    }
  });

  it("promisifies unary RPCs and wraps gRPC errors", async () => {
    const grpc = createMockGrpcClient();
    const health = createMockHealthClient();
    const client = createClientForTest(grpc, health);

    grpc.getVersion.mockImplementation((_req, callback) => {
      callback(null, { version: "1.2.3", schemaVersion: "v1" });
    });
    await expect(client.getVersion()).resolves.toEqual({
      version: "1.2.3",
      schemaVersion: "v1",
    });

    grpc.getVersion.mockImplementation((_req, callback) => {
      callback(
        {
          code: grpcStatus.UNAVAILABLE,
          details: "runtime unavailable",
          metadata: {},
          name: "Error",
          message: "runtime unavailable",
        },
        null,
      );
    });
    await expect(client.getVersion()).rejects.toBeInstanceOf(PhronyRuntimeError);
  });

  it("opens bidi stream factories", () => {
    const grpc = createMockGrpcClient();
    const health = createMockHealthClient();
    const client = createClientForTest(grpc, health);

    expect(client.work()).toEqual({ kind: "work-stream" });
    const interactive = client.runSessionInteractive();
    expect(interactive).toBeInstanceOf(InteractiveSession);
    expect(grpc.work).toHaveBeenCalledOnce();
    expect(grpc.runSessionInteractive).toHaveBeenCalledOnce();
  });

  it("closes underlying clients", () => {
    const grpc = createMockGrpcClient();
    const health = createMockHealthClient();
    const client = createClientForTest(grpc, health);

    client.close();
    expect(grpc.close).toHaveBeenCalledOnce();
    expect(health.close).toHaveBeenCalledOnce();
  });
});
