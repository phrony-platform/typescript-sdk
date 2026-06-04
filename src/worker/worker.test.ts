import { EventEmitter } from "node:events";
import type { ClientDuplexStream } from "@grpc/grpc-js";
import { describe, expect, it, vi } from "vitest";
import type { WorkClientMsg, WorkServerMsg } from "../gen/phrony/runtime/v1/runtime.js";
import { ToolError, handlerKey, type RegisteredTool, type WorkerOptions } from "./types.js";
import { runWorkerSession } from "./worker-session.js";

type MockDuplex = ClientDuplexStream<WorkClientMsg, WorkServerMsg> & {
  written: WorkClientMsg[];
  emitData: (msg: WorkServerMsg) => void;
};

function createMockDuplexStream(): MockDuplex {
  const emitter = new EventEmitter();
  const written: WorkClientMsg[] = [];
  return Object.assign(emitter, {
    written,
    write(msg: WorkClientMsg) {
      written.push(msg);
      return true;
    },
    end() {
      emitter.emit("end");
    },
    emitData(msg: WorkServerMsg) {
      emitter.emit("data", msg);
    },
  }) as MockDuplex;
}

function createHandlers(
  entries: Array<{
    tool: string;
    version: string;
    handler: RegisteredTool["handler"];
  }>,
): Map<string, RegisteredTool> {
  const handlers = new Map<string, RegisteredTool>();
  for (const entry of entries) {
    handlers.set(handlerKey(entry.tool, entry.version), {
      tool: entry.tool,
      version: entry.version,
      maxConcurrency: 4,
      handler: entry.handler,
    });
  }
  return handlers;
}

const workerOptions: WorkerOptions = {
  runtimeAddr: "127.0.0.1:7777",
  workerId: "test-worker",
};

describe("runWorkerSession", () => {
  it("registers tools and dispatches invoke results to handlers", async () => {
    const stream = createMockDuplexStream();
    const handler = vi.fn(async ({ city }: { city: string }) => ({
      temp_c: 12,
      city,
    }));
    const client = {
      work: () => stream,
      close: vi.fn(),
    };

    const session = runWorkerSession(
      client,
      workerOptions,
      createHandlers([{ tool: "weather.get-forecast", version: "1.0.0", handler }]),
    );

    await new Promise<void>((resolve) => setImmediate(resolve));
    stream.emitData({ registered: { workerId: "test-worker", leaseTtlMs: 30_000 } });
    stream.emitData({
      invoke: {
        callId: "call-1",
        sessionId: "sess-1",
        agentVersionId: "av-1",
        turn: 0,
        tool: "weather.get-forecast",
        version: "1.0.0",
        args: Buffer.from('{"city":"Paris"}'),
        sideEffectClass: "read_only",
        deadlineUnixMs: 0,
      },
    });

    await vi.waitFor(() => {
      expect(handler).toHaveBeenCalledWith(
        { city: "Paris" },
        expect.objectContaining({
          callId: "call-1",
          sessionId: "sess-1",
          tool: "weather.get-forecast",
          signal: expect.any(AbortSignal),
        }),
      );
    });

    await vi.waitFor(() => {
      const result = stream.written.find((msg) => msg.result?.callId === "call-1")?.result;
      expect(result).toBeDefined();
      expect(JSON.parse(result!.payload.toString("utf8"))).toEqual({
        temp_c: 12,
        city: "Paris",
      });
    });

    await session.close();
    await session.done;
  });

  it("nacks unknown tools and invalid args", async () => {
    const stream = createMockDuplexStream();
    const client = { work: () => stream, close: vi.fn() };
    const session = runWorkerSession(
      client,
      workerOptions,
      createHandlers([{ tool: "known", version: "v1", handler: async () => ({ ok: true }) }]),
    );

    await new Promise<void>((resolve) => setImmediate(resolve));
    stream.emitData({ registered: { workerId: "test-worker", leaseTtlMs: 30_000 } });
    stream.emitData({
      invoke: {
        callId: "missing",
        sessionId: "s",
        agentVersionId: "av",
        turn: 0,
        tool: "unknown",
        version: "v1",
        args: Buffer.from("{}"),
        sideEffectClass: "read_only",
        deadlineUnixMs: 0,
      },
    });

    await vi.waitFor(() => {
      expect(stream.written.find((msg) => msg.nack?.callId === "missing")?.nack).toMatchObject({
        code: "unknown_handler",
      });
    });

    stream.emitData({
      invoke: {
        callId: "bad-args",
        sessionId: "s",
        agentVersionId: "av",
        turn: 0,
        tool: "known",
        version: "v1",
        args: Buffer.from("{"),
        sideEffectClass: "read_only",
        deadlineUnixMs: 0,
      },
    });

    await vi.waitFor(() => {
      expect(stream.written.find((msg) => msg.nack?.callId === "bad-args")?.nack).toMatchObject({
        code: "invalid_args",
      });
    });

    await session.close();
    await session.done;
  });

  it("maps ToolError and cancellation to structured results", async () => {
    const stream = createMockDuplexStream();
    const client = { work: () => stream, close: vi.fn() };
    const session = runWorkerSession(
      client,
      workerOptions,
      createHandlers([
        {
          tool: "fail",
          version: "v1",
          handler: async () => {
            throw new ToolError("upstream", "service unavailable");
          },
        },
        {
          tool: "slow",
          version: "v1",
          handler: async (_args, ctx) => {
            await new Promise((resolve) => setTimeout(resolve, 50));
            if (ctx.signal.aborted) {
              throw new Error("aborted locally");
            }
            return { ok: true };
          },
        },
      ]),
    );

    await new Promise<void>((resolve) => setImmediate(resolve));
    stream.emitData({ registered: { workerId: "test-worker", leaseTtlMs: 30_000 } });
    stream.emitData({
      invoke: {
        callId: "fail-1",
        sessionId: "s",
        agentVersionId: "av",
        turn: 0,
        tool: "fail",
        version: "v1",
        args: Buffer.from("{}"),
        sideEffectClass: "read_only",
        deadlineUnixMs: 0,
      },
    });

    await vi.waitFor(() => {
      expect(
        stream.written.find((msg) => msg.result?.callId === "fail-1")?.result?.error,
      ).toMatchObject({
        code: "upstream",
        message: "service unavailable",
      });
    });

    stream.emitData({
      invoke: {
        callId: "cancel-1",
        sessionId: "s",
        agentVersionId: "av",
        turn: 0,
        tool: "slow",
        version: "v1",
        args: Buffer.from("{}"),
        sideEffectClass: "read_only",
        deadlineUnixMs: 0,
      },
    });

    await Promise.resolve();
    stream.emitData({ cancel: { callId: "cancel-1" } });

    await vi.waitFor(() => {
      expect(
        stream.written.find((msg) => msg.result?.callId === "cancel-1")?.result?.error,
      ).toMatchObject({
        code: "cancelled",
      });
    });

    await session.close();
    await session.done;
  });
});

describe("runWorkerSession deadlines", () => {
  it("returns cancelled when the invoke deadline has already passed", async () => {
    const stream = createMockDuplexStream();
    const client = { work: () => stream, close: vi.fn() };
    const handler = vi.fn(async (_args, ctx) => {
      expect(ctx.signal.aborted).toBe(true);
      return { ok: true };
    });
    const session = runWorkerSession(
      client,
      workerOptions,
      createHandlers([{ tool: "slow", version: "v1", handler }]),
    );

    await Promise.resolve();
    stream.emitData({ registered: { workerId: "test-worker", leaseTtlMs: 30_000 } });
    stream.emitData({
      invoke: {
        callId: "expired",
        sessionId: "s",
        agentVersionId: "av",
        turn: 0,
        tool: "slow",
        version: "v1",
        args: Buffer.from("{}"),
        sideEffectClass: "read_only",
        deadlineUnixMs: Date.now() - 1,
      },
    });

    await vi.waitFor(() => {
      expect(
        stream.written.find((msg) => msg.result?.callId === "expired")?.result?.error,
      ).toMatchObject({ code: "cancelled" });
    });
    expect(handler).toHaveBeenCalledOnce();

    await session.close();
    await session.done;
  });

  it("maps unexpected handler failures to internal errors", async () => {
    const stream = createMockDuplexStream();
    const client = { work: () => stream, close: vi.fn() };
    const session = runWorkerSession(
      client,
      workerOptions,
      createHandlers([
        {
          tool: "boom",
          version: "v1",
          handler: async () => {
            throw new Error("unexpected");
          },
        },
      ]),
    );

    await Promise.resolve();
    stream.emitData({ registered: { workerId: "test-worker", leaseTtlMs: 30_000 } });
    stream.emitData({
      invoke: {
        callId: "boom-1",
        sessionId: "s",
        agentVersionId: "av",
        turn: 0,
        tool: "boom",
        version: "v1",
        args: Buffer.from("{}"),
        sideEffectClass: "read_only",
        deadlineUnixMs: 0,
      },
    });

    await vi.waitFor(() => {
      expect(
        stream.written.find((msg) => msg.result?.callId === "boom-1")?.result?.error,
      ).toMatchObject({
        code: "internal",
        message: "unexpected",
      });
    });

    await session.close();
    await session.done;
  });
});

describe("Worker", () => {
  it("rejects duplicate registration", async () => {
    const { Worker } = await import("./worker.js");
    const worker = new Worker({ runtimeAddr: "127.0.0.1:7777", workerId: "w" });
    worker.registerTool({ tool: "t", version: "v1", handler: async () => ({}) });
    expect(() => worker.registerTool({ tool: "t", version: "v1", handler: async () => ({}) })).toThrow(
      /already registered/,
    );
  });

  it("rejects registration after connect and connect without handlers", async () => {
    const { Worker } = await import("./worker.js");
    const { RuntimeClient } = await import("../client/runtime-client.js");

    const stream = createMockDuplexStream();
    const mockClient = {
      work: () => stream,
      close: vi.fn(),
    };
    vi.spyOn(RuntimeClient, "connect").mockResolvedValue(mockClient as never);

    const worker = new Worker({ runtimeAddr: "127.0.0.1:7777", workerId: "w" });
    worker.registerTool({ tool: "t", version: "v1", handler: async () => ({}) });

    const connectPromise = worker.connect();
    await Promise.resolve();
    stream.emitData({ registered: { workerId: "w", leaseTtlMs: 30_000 } });

    expect(() => worker.registerTool({ tool: "other", version: "v1", handler: async () => ({}) })).toThrow(
      /after connect/,
    );

    await worker.close();
    await connectPromise;

    const empty = new Worker({ runtimeAddr: "127.0.0.1:7777", workerId: "empty" });
    await expect(empty.connect()).rejects.toThrow(/register at least one tool/);

    vi.restoreAllMocks();
  });
});
