import type { ClientDuplexStream } from "@grpc/grpc-js";
import type {
  WorkClientMsg,
  WorkHandlerAdvertisement,
  WorkRegister,
  WorkServerMsg,
  WorkToolNack,
  WorkToolResult,
} from "../gen/phrony/runtime/v1/runtime.js";
import { DEFAULT_MAX_CONCURRENCY, heartbeatIntervalMs } from "./types.js";

export type WorkStreamHandlers = {
  onRegistered?: (leaseTtlMs: number) => void;
  onInvoke?: (invoke: NonNullable<WorkServerMsg["invoke"]>) => void;
  onCancel?: (callId: string) => void;
  onResultAck?: (callId: string) => void;
  onError?: (error: Error) => void;
  onEnd?: () => void;
};

/** Low-level helper for the bidirectional `Runtime.Work` stream. */
export class WorkStream {
  private readonly stream: ClientDuplexStream<WorkClientMsg, WorkServerMsg>;
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  private closed = false;
  private readonly inFlightCallIds = new Set<string>();

  constructor(stream: ClientDuplexStream<WorkClientMsg, WorkServerMsg>) {
    this.stream = stream;
  }

  /** Send the initial (or reconnect) registration message. */
  sendRegister(register: WorkRegister): void {
    this.write({ register });
  }

  sendHeartbeat(): void {
    this.write({ heartbeat: {} });
  }

  sendResult(result: WorkToolResult): void {
    this.inFlightCallIds.add(result.callId);
    this.write({ result });
  }

  sendNack(nack: WorkToolNack): void {
    this.inFlightCallIds.delete(nack.callId);
    this.write({ nack });
  }

  /** Call ids still executing or awaiting a runtime `result_ack`. */
  inFlightCalls(): string[] {
    return [...this.inFlightCallIds];
  }

  markCallExecuting(callId: string): void {
    this.inFlightCallIds.add(callId);
  }

  /** Stop heartbeats and half-close the client side of the stream. */
  run(handlers: WorkStreamHandlers): void {
    this.stream.on("data", (msg: WorkServerMsg) => {
      if (msg.registered !== undefined) {
        const leaseTtlMs = msg.registered.leaseTtlMs;
        handlers.onRegistered?.(leaseTtlMs);
        this.startHeartbeat(leaseTtlMs);
        return;
      }
      if (msg.invoke !== undefined) {
        handlers.onInvoke?.(msg.invoke);
        return;
      }
      if (msg.cancel !== undefined) {
        handlers.onCancel?.(msg.cancel.callId);
        return;
      }
      if (msg.resultAck !== undefined) {
        this.inFlightCallIds.delete(msg.resultAck.callId);
        handlers.onResultAck?.(msg.resultAck.callId);
        return;
      }
      // heartbeatAck — no action required
    });

    this.stream.on("error", (error: Error) => {
      if (!this.closed) {
        handlers.onError?.(error);
      }
    });

    this.stream.on("end", () => {
      this.stopHeartbeat();
      handlers.onEnd?.();
    });
  }

  /** Stop heartbeats and half-close the client side of the stream. */
  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.stopHeartbeat();
    this.stream.end();
  }

  private startHeartbeat(leaseTtlMs: number): void {
    this.stopHeartbeat();
    const intervalMs = heartbeatIntervalMs(leaseTtlMs);
    this.heartbeatTimer = setInterval(() => {
      if (this.closed) {
        return;
      }
      try {
        this.sendHeartbeat();
      } catch {
        this.stopHeartbeat();
      }
    }, intervalMs);
    this.heartbeatTimer.unref?.();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== undefined) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  private write(msg: WorkClientMsg): void {
    if (this.closed) {
      throw new Error("work stream is closed");
    }
    this.stream.write(msg);
  }
}

/** Build handler advertisements for registration. */
export function buildHandlerAdvertisements(
  handlers: Iterable<{
    tool: string;
    version: string;
    contractVersion?: string;
    descriptorHash?: string;
    maxConcurrency?: number;
  }>,
): WorkHandlerAdvertisement[] {
  const out: WorkHandlerAdvertisement[] = [];
  for (const handler of handlers) {
    out.push({
      tool: handler.tool,
      version: handler.version,
      contractVersion: handler.contractVersion ?? "",
      descriptorHash: handler.descriptorHash ?? "",
      maxConcurrency: handler.maxConcurrency && handler.maxConcurrency > 0
        ? handler.maxConcurrency
        : DEFAULT_MAX_CONCURRENCY,
    });
  }
  return out;
}
