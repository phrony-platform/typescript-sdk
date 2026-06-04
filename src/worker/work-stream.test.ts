import { EventEmitter } from "node:events";
import type { ClientDuplexStream } from "@grpc/grpc-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkClientMsg, WorkServerMsg } from "../gen/phrony/runtime/v1/runtime.js";
import { WorkStream, buildHandlerAdvertisements } from "./work-stream.js";

type MockDuplex = ClientDuplexStream<WorkClientMsg, WorkServerMsg> & {
  written: WorkClientMsg[];
  emitData: (msg: WorkServerMsg) => void;
  emitEnd: () => void;
};

function createMockDuplexStream(): MockDuplex {
  const emitter = new EventEmitter();
  const written: WorkClientMsg[] = [];
  const stream = Object.assign(emitter, {
    written,
    write(msg: WorkClientMsg) {
      written.push(msg);
      return true;
    },
    end: vi.fn(() => {
      emitter.emit("end");
    }),
    emitData(msg: WorkServerMsg) {
      emitter.emit("data", msg);
    },
    emitEnd() {
      emitter.emit("end");
    },
  }) as MockDuplex;
  return stream;
}

describe("WorkStream", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends register, heartbeats after registered, and results", () => {
    vi.useFakeTimers();
    const stream = createMockDuplexStream();
    const work = new WorkStream(stream);
    const onInvoke = vi.fn();

    work.run({
      onRegistered: vi.fn(),
      onInvoke,
    });

    work.sendRegister({
      workerId: "w1",
      workloadIdentity: "",
      imageDigest: "",
      handlers: buildHandlerAdvertisements([
        { tool: "echo", version: "v1", maxConcurrency: 2 },
      ]),
      inFlight: [],
    });

    expect(stream.written).toEqual([
      expect.objectContaining({
        register: expect.objectContaining({ workerId: "w1" }),
      }),
    ]);

    stream.emitData({ registered: { workerId: "w1", leaseTtlMs: 10_000 } });
    vi.advanceTimersByTime(5_000);
    expect(stream.written.some((msg) => msg.heartbeat !== undefined)).toBe(true);

    stream.emitData({
      invoke: {
        callId: "c1",
        sessionId: "s1",
        agentVersionId: "av1",
        turn: 0,
        tool: "echo",
        version: "v1",
        args: Buffer.from('{"q":"hi"}'),
        sideEffectClass: "read_only",
        deadlineUnixMs: 0,
      },
    });
    expect(onInvoke).toHaveBeenCalledWith(expect.objectContaining({ callId: "c1" }));

    work.sendResult({ callId: "c1", payload: Buffer.from('{"ok":true}') });
    expect(work.inFlightCalls()).toEqual(["c1"]);

    stream.emitData({ resultAck: { callId: "c1" } });
    expect(work.inFlightCalls()).toEqual([]);
  });

  it("defaults max concurrency in handler advertisements", () => {
    expect(buildHandlerAdvertisements([{ tool: "t", version: "v1" }])).toEqual([
      {
        tool: "t",
        version: "v1",
        contractVersion: "",
        descriptorHash: "",
        maxConcurrency: 4,
      },
    ]);
  });

  it("closes the stream and stops heartbeats", () => {
    vi.useFakeTimers();
    const stream = createMockDuplexStream();
    const work = new WorkStream(stream);
    const onEnd = vi.fn();

    work.run({ onEnd });
    stream.emitData({ registered: { workerId: "w1", leaseTtlMs: 10_000 } });
    work.close();

    expect(stream.end).toHaveBeenCalled();
    vi.advanceTimersByTime(10_000);
    const heartbeatsAfterClose = stream.written.filter((msg) => msg.heartbeat !== undefined);
    expect(heartbeatsAfterClose).toHaveLength(0);
  });
});
