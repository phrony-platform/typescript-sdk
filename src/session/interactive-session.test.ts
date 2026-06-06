import { EventEmitter } from "node:events";
import type { ClientDuplexStream } from "@grpc/grpc-js";
import { describe, expect, it, vi } from "vitest";
import { jsonBytes } from "../client/json-bytes.js";
import type {
  RunSessionInteractiveClientMsg,
  RunSessionInteractiveServerMsg,
} from "../gen/phrony/runtime/v1/runtime.js";
import { InteractiveSession } from "./interactive-session.js";

type MockDuplex = ClientDuplexStream<
  RunSessionInteractiveClientMsg,
  RunSessionInteractiveServerMsg
> & {
  written: RunSessionInteractiveClientMsg[];
  emitData: (msg: RunSessionInteractiveServerMsg) => void;
  emitEnd: () => void;
  emitError: (error: Error) => void;
};

function createMockDuplexStream(): MockDuplex {
  const emitter = new EventEmitter();
  const written: RunSessionInteractiveClientMsg[] = [];
  const stream = Object.assign(emitter, {
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
    emitError(error: Error) {
      emitter.emit("error", error);
    },
  }) as MockDuplex;
  return stream;
}

async function collectEvents(
  session: InteractiveSession,
  limit = 20,
): Promise<Awaited<ReturnType<InteractiveSession["events"]>> extends AsyncIterable<infer T> ? T[] : never> {
  const events = [];
  for await (const event of session.events()) {
    events.push(event);
    if (events.length >= limit) {
      break;
    }
  }
  return events;
}

describe("InteractiveSession", () => {
  it("start sends bundle ref, input, and resolved secrets", () => {
    const stream = createMockDuplexStream();
    const session = new InteractiveSession(stream);

    session.start({
      bundleRef: { namespace: "demo", name: "payment-desk", version: "" },
      input: { amount: 500 },
      resolvedSecrets: { apiKey: "secret" },
    });

    expect(stream.written).toEqual([
      {
        start: {
          agentRef: undefined,
          bundleRef: { namespace: "demo", name: "payment-desk", version: "" },
          input: jsonBytes({ amount: 500 }),
          sessionId: "",
          resolvedSecrets: { apiKey: Buffer.from("secret", "utf8") },
        },
      },
    ]);
  });

  it("start sends agent ref, input, and resolved secrets", () => {
    const stream = createMockDuplexStream();
    const session = new InteractiveSession(stream);

    session.start({
      agentRef: { namespace: "default", name: "agent", version: "" },
      input: { claimId: "CLM-1" },
      resolvedSecrets: { apiKey: "secret" },
    });

    expect(stream.written).toEqual([
      {
        start: {
          agentRef: { namespace: "default", name: "agent", version: "" },
          input: jsonBytes({ claimId: "CLM-1" }),
          sessionId: "",
          resolvedSecrets: { apiKey: Buffer.from("secret", "utf8") },
        },
      },
    ]);
  });

  it("attach sends only session id", () => {
    const stream = createMockDuplexStream();
    const session = new InteractiveSession(stream);

    session.attach({ sessionId: "sess-abc" });

    expect(stream.written).toEqual([
      {
        start: {
          agentRef: undefined,
          input: Buffer.alloc(0),
          sessionId: "sess-abc",
          resolvedSecrets: {},
        },
      },
    ]);
  });

  it("rejects a second start", () => {
    const stream = createMockDuplexStream();
    const session = new InteractiveSession(stream);
    session.start({
      agentRef: { namespace: "default", name: "a", version: "" },
      input: {},
    });
    expect(() =>
      session.attach({ sessionId: "sess-2" }),
    ).toThrow(/already started/);
  });

  it("maps server messages to interactive events", async () => {
    const stream = createMockDuplexStream();
    const session = new InteractiveSession(stream);

    const eventsPromise = collectEvents(session);

    stream.emitData({
      sessionStarted: {
        sessionId: "sess-1",
        agentVersionId: "av-1",
        modelProvider: "openai",
        modelName: "gpt-4",
        history: [{ role: "user", content: "hi", stopReason: "", turnDurationMs: 0 }],
        maxTokensPerRun: 0,
        maxWallClockSeconds: 0,
        sessionStartedAtUnixMs: 1,
        sessionEndedAtUnixMs: 0,
      },
    });
    stream.emitData({ textDelta: { delta: "Hello" } });
    stream.emitData({
      completed: {
        stopReason: "end_turn",
        output: jsonBytes({ ok: true }),
        sessionEndedAtUnixMs: 99,
      },
    });
    stream.emitEnd();

    const events = await eventsPromise;
    expect(events).toEqual([
      {
        type: "session_started",
        session: expect.objectContaining({ sessionId: "sess-1" }),
        history: [{ role: "user", content: "hi", stopReason: "", turnDurationMs: 0 }],
      },
      { type: "text_delta", delta: "Hello" },
      {
        type: "completed",
        stopReason: "end_turn",
        output: { ok: true },
        stats: undefined,
        sessionEndedAtUnixMs: 99,
      },
      { type: "stream_end" },
    ]);
  });

  it("sendUserMessage and decideToolApproval write client messages", () => {
    const stream = createMockDuplexStream();
    const session = new InteractiveSession(stream);

    session.sendUserMessage("follow-up");
    session.decideToolApproval({
      approvalId: "ap-1",
      approved: true,
      comment: "ok",
      args: { x: 1 },
    });

    expect(stream.written).toEqual([
      { userMessage: { text: "follow-up" } },
      {
        toolApproval: {
          approvalId: "ap-1",
          approved: true,
          comment: "ok",
          args: jsonBytes({ x: 1 }),
        },
      },
    ]);
  });

  it("parses tool and approval events with JSON args", async () => {
    const stream = createMockDuplexStream();
    const session = new InteractiveSession(stream);
    const eventsPromise = collectEvents(session, 3);

    stream.emitData({
      toolCall: {
        callId: "c1",
        tool: "weather",
        version: "1.0.0",
        args: jsonBytes({ city: "Paris" }),
      },
    });
    stream.emitData({
      approvalRequired: {
        approvalId: "ap-1",
        callId: "c1",
        tool: "weather",
        version: "1.0.0",
        args: jsonBytes({ city: "Paris" }),
        route: "human",
        reason: "policy",
        authorityRef: "",
        policyName: "default",
        policyRuntime: jsonBytes({ tier: "high" }),
        approvalsRequired: 1,
        approvalsReceived: 0,
        comprehensionRequired: false,
        expiresAt: "",
      },
    });
    stream.emitEnd();

    const events = await eventsPromise;
    expect(events[0]).toEqual({
      type: "tool_call",
      callId: "c1",
      tool: "weather",
      version: "1.0.0",
      args: { city: "Paris" },
    });
    expect(events[1]).toMatchObject({
      type: "approval_required",
      args: { city: "Paris" },
      policyRuntime: { tier: "high" },
    });
  });

  it("close ends the stream and rejects further writes", () => {
    const stream = createMockDuplexStream();
    const session = new InteractiveSession(stream);

    session.close();
    expect(stream.end).toHaveBeenCalled();
    expect(() => session.sendUserMessage("late")).toThrow(/closed/);
  });

  it("maps awaiting_input, failed, cancelled, and tool_result events", async () => {
    const stream = createMockDuplexStream();
    const session = new InteractiveSession(stream);
    const eventsPromise = collectEvents(session, 6);

    stream.emitData({
      awaitingInput: {
        stopReason: "tool_calls",
        stats: { totalTokens: 10, promptTokens: 5, completionTokens: 5 },
        inputBlockedReason: "",
      },
    });
    stream.emitData({ failed: { message: "quota exceeded" } });
    stream.emitData({
      toolResult: {
        callId: "c1",
        payload: jsonBytes({ temp_c: 12 }),
        errorMessage: "",
      },
    });
    stream.emitData({ cancelled: { sessionEndedAtUnixMs: 42 } });
    stream.emitEnd();

    const events = await eventsPromise;
    expect(events).toEqual([
      {
        type: "awaiting_input",
        stopReason: "tool_calls",
        stats: { totalTokens: 10, promptTokens: 5, completionTokens: 5 },
        inputBlockedReason: "",
      },
      { type: "failed", message: "quota exceeded" },
      {
        type: "tool_result",
        callId: "c1",
        payload: { temp_c: 12 },
        errorMessage: "",
      },
      { type: "cancelled", sessionEndedAtUnixMs: 42 },
      { type: "stream_end" },
    ]);
  });

  it("surfaces stream errors to event consumers", async () => {
    const stream = createMockDuplexStream();
    const session = new InteractiveSession(stream);
    const events = session.events();

    const next = events[Symbol.asyncIterator]().next();
    stream.emitError(new Error("connection reset"));

    await expect(next).rejects.toThrow(/connection reset/);
  });
});
