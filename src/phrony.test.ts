import { EventEmitter } from "node:events";
import type { ClientDuplexStream } from "@grpc/grpc-js";
import { describe, expect, it, vi } from "vitest";
import { jsonBytes } from "./client/json-bytes.js";
import type {
  RunSessionInteractiveClientMsg,
  RunSessionInteractiveServerMsg,
  RunSessionRequest,
  RunSessionResponse,
} from "./gen/phrony/runtime/v1/runtime.js";
import { AgentSessionError, Phrony } from "./phrony.js";
import { RuntimeClient } from "./client/runtime-client.js";

type MockDuplex = ClientDuplexStream<
  RunSessionInteractiveClientMsg,
  RunSessionInteractiveServerMsg
> & {
  written: RunSessionInteractiveClientMsg[];
  emitData: (msg: RunSessionInteractiveServerMsg) => void;
  emitEnd: () => void;
};

function createMockInteractiveStream(): MockDuplex {
  const emitter = new EventEmitter();
  const written: RunSessionInteractiveClientMsg[] = [];
  return Object.assign(emitter, {
    written,
    write(msg: RunSessionInteractiveClientMsg) {
      written.push(msg);
      return true;
    },
    end: vi.fn(() => {
      emitter.emit("end");
    }),
    emitData(msg: RunSessionInteractiveServerMsg) {
      emitter.emit("data", msg);
    },
    emitEnd() {
      emitter.emit("end");
    },
  }) as MockDuplex;
}

function mockRuntimeClient(overrides: {
  runSession?: (req: RunSessionRequest) => Promise<RunSessionResponse>;
  interactiveStream?: MockDuplex;
}): RuntimeClient {
  const interactiveStream = overrides.interactiveStream ?? createMockInteractiveStream();
  const grpc = {
    runSession: vi.fn((_req, callback: (err: null, res: RunSessionResponse) => void) => {
      const runSession = overrides.runSession;
      if (runSession !== undefined) {
        runSession(_req as RunSessionRequest)
          .then((res) => callback(null, res))
          .catch((err: Error) => callback(err as null, {} as RunSessionResponse));
        return;
      }
      callback(null, {
        sessionId: "sess-bg",
        agentVersionId: "ver-1",
        status: "running",
      });
    }),
    runSessionInteractive: vi.fn(() => interactiveStream),
    close: vi.fn(),
  };
  const health = { close: vi.fn() };
  return Reflect.construct(RuntimeClient, [grpc, health, "127.0.0.1:7777"]);
}

describe("Phrony", () => {
  it("agent().run() waits for completed output on the interactive stream", async () => {
    const stream = createMockInteractiveStream();
    const phrony = new Phrony({ runtimeAddr: "127.0.0.1:7777" });
    const client = mockRuntimeClient({ interactiveStream: stream });
    vi.spyOn(phrony, "ensureClient").mockResolvedValue(client);

    const runPromise = phrony.agent("default/my-agent").run({
      input: { claimId: "CLM-48219" },
      resolvedSecrets: { openai: "key" },
    });

    await Promise.resolve();

    expect(stream.written[0]?.start?.agentRef).toEqual({
      namespace: "default",
      name: "my-agent",
      version: "",
    });
    expect(stream.written[0]?.start?.input).toEqual(jsonBytes({ claimId: "CLM-48219" }));

    stream.emitData({
      sessionStarted: {
        sessionId: "sess-1",
        agentVersionId: "ver-abc",
        modelProvider: "openai",
        modelName: "gpt-4o",
        history: [],
        maxTokensPerRun: 0,
        maxWallClockSeconds: 0,
        sessionStartedAtUnixMs: 1,
        sessionEndedAtUnixMs: 0,
      },
    });
    stream.emitData({
      completed: {
        stopReason: "end_turn",
        output: jsonBytes({ answer: "done" }),
        sessionEndedAtUnixMs: 2,
      },
    });
    stream.emitEnd();

    await expect(runPromise).resolves.toEqual({
      sessionId: "sess-1",
      agentVersionId: "ver-abc",
      output: { answer: "done" },
      stopReason: "end_turn",
      stats: undefined,
    });
    expect(stream.end).toHaveBeenCalled();
  });

  it("agent().run({ wait: false }) uses unary RunSession", async () => {
    const phrony = new Phrony();
    const runSession = vi.fn(async (req: RunSessionRequest) => {
      expect(req.agentRef).toEqual({
        namespace: "demo",
        name: "echo",
        version: "2.0.0",
      });
      return {
        sessionId: "sess-detached",
        agentVersionId: "ver-2",
        status: "running",
      };
    });
    vi.spyOn(phrony, "ensureClient").mockResolvedValue(
      mockRuntimeClient({ runSession }),
    );

    const result = await phrony.agent("demo/echo@1.0.0").run({
      wait: false,
      version: "2.0.0",
      input: { q: 1 },
    });

    expect(result).toEqual({
      sessionId: "sess-detached",
      agentVersionId: "ver-2",
      status: "running",
    });
    expect(runSession).toHaveBeenCalledOnce();
  });

  it("agent().run() throws AgentSessionError on failed events", async () => {
    const stream = createMockInteractiveStream();
    const phrony = new Phrony();
    vi.spyOn(phrony, "ensureClient").mockResolvedValue(
      mockRuntimeClient({ interactiveStream: stream }),
    );

    const runPromise = phrony.agent("demo/echo").run();

    await Promise.resolve();

    stream.emitData({
      sessionStarted: {
        sessionId: "sess-fail",
        agentVersionId: "ver",
        modelProvider: "",
        modelName: "",
        history: [],
        maxTokensPerRun: 0,
        maxWallClockSeconds: 0,
        sessionStartedAtUnixMs: 0,
        sessionEndedAtUnixMs: 0,
      },
    });
    stream.emitData({ failed: { message: "model unavailable" } });
    stream.emitEnd();

    await expect(runPromise).rejects.toMatchObject({
      name: "AgentSessionError",
      message: "model unavailable",
      sessionId: "sess-fail",
    });
  });

  it("agent().runInteractive() returns an open interactive session", async () => {
    const stream = createMockInteractiveStream();
    const phrony = new Phrony();
    vi.spyOn(phrony, "ensureClient").mockResolvedValue(
      mockRuntimeClient({ interactiveStream: stream }),
    );

    const session = await phrony.agent("default/agent").runInteractive({
      input: { x: 1 },
    });

    expect(session).toBeDefined();
    expect(stream.written[0]?.start?.agentRef?.name).toBe("agent");
    session.close();
  });
});
