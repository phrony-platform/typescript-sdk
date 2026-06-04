import type { ClientDuplexStream } from "@grpc/grpc-js";
import { jsonBytes, jsonBytesMap, parseJsonBytes } from "../client/json-bytes.js";
import { wrapRpcError } from "../client/errors.js";
import type {
  RunSessionInteractiveClientMsg,
  RunSessionInteractiveServerMsg,
  RunSessionInteractiveStart,
} from "../gen/phrony/runtime/v1/runtime.js";
import type {
  InteractiveEvent,
  InteractiveSessionAttachOptions,
  InteractiveSessionStartOptions,
  InteractiveToolApprovalOptions,
} from "./types.js";

type EventQueueItem =
  | { kind: "event"; event: InteractiveEvent }
  | { kind: "error"; error: Error }
  | { kind: "end" };

/** Bidirectional `RunSessionInteractive` session with typed events and client messages. */
export class InteractiveSession {
  private readonly stream: ClientDuplexStream<
    RunSessionInteractiveClientMsg,
    RunSessionInteractiveServerMsg
  >;
  private readonly queue: EventQueueItem[] = [];
  private readonly waiters: Array<(item: EventQueueItem) => void> = [];
  private started = false;
  private closed = false;
  private listenersAttached = false;

  constructor(stream: ClientDuplexStream<RunSessionInteractiveClientMsg, RunSessionInteractiveServerMsg>) {
    this.stream = stream;
    this.attachStreamListeners();
  }

  /** Start a new interactive session (first client message on the stream). */
  start(options: InteractiveSessionStartOptions): void {
    const start: RunSessionInteractiveStart = {
      agentRef: options.agentRef,
      input: jsonBytes(options.input),
      sessionId: "",
      resolvedSecrets: jsonBytesMap(options.resolvedSecrets ?? {}),
    };
    this.sendStart(start);
  }

  /** Attach to an existing session by id (first client message on the stream). */
  attach(options: InteractiveSessionAttachOptions): void {
    const start: RunSessionInteractiveStart = {
      agentRef: undefined,
      input: Buffer.alloc(0),
      sessionId: options.sessionId,
      resolvedSecrets: {},
    };
    this.sendStart(start);
  }

  sendUserMessage(text: string): void {
    this.write({ userMessage: { text } });
  }

  decideToolApproval(options: InteractiveToolApprovalOptions): void {
    this.write({
      toolApproval: {
        approvalId: options.approvalId,
        approved: options.approved,
        comment: options.comment ?? "",
        args: options.args !== undefined ? jsonBytes(options.args) : Buffer.alloc(0),
      },
    });
  }

  /** Async iterable of server events until the stream ends or fails. */
  events(): AsyncIterable<InteractiveEvent> {
    return {
      [Symbol.asyncIterator]: () => ({
        next: () => this.nextEvent(),
      }),
    };
  }

  /** Half-close the client side of the stream. */
  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.stream.end();
  }

  private sendStart(start: RunSessionInteractiveStart): void {
    if (this.started) {
      throw new Error("interactive session already started");
    }
    this.started = true;
    this.write({ start });
  }

  private write(msg: RunSessionInteractiveClientMsg): void {
    if (this.closed) {
      throw new Error("interactive session is closed");
    }
    try {
      this.stream.write(msg);
    } catch (error) {
      throw wrapRpcError("run session interactive", error);
    }
  }

  private attachStreamListeners(): void {
    if (this.listenersAttached) {
      return;
    }
    this.listenersAttached = true;

    this.stream.on("data", (msg: RunSessionInteractiveServerMsg) => {
      const event = mapServerMessage(msg);
      if (event !== undefined) {
        this.enqueue({ kind: "event", event });
      }
    });

    this.stream.on("error", (error: Error) => {
      if (this.closed) {
        return;
      }
      this.enqueue({ kind: "error", error: wrapRpcError("run session interactive", error) });
    });

    this.stream.on("end", () => {
      this.enqueue({ kind: "event", event: { type: "stream_end" } });
      this.enqueue({ kind: "end" });
    });
  }

  private enqueue(item: EventQueueItem): void {
    const waiter = this.waiters.shift();
    if (waiter !== undefined) {
      waiter(item);
      return;
    }
    this.queue.push(item);
  }

  private async nextEvent(): Promise<IteratorResult<InteractiveEvent>> {
    const item = await this.dequeue();
    if (item.kind === "error") {
      throw item.error;
    }
    if (item.kind === "end") {
      return { done: true, value: undefined };
    }
    return { value: item.event, done: false };
  }

  private dequeue(): Promise<EventQueueItem> {
    const pending = this.queue.shift();
    if (pending !== undefined) {
      return Promise.resolve(pending);
    }
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }
}

function mapServerMessage(msg: RunSessionInteractiveServerMsg): InteractiveEvent | undefined {
  if (msg.sessionStarted !== undefined) {
    const session = msg.sessionStarted;
    return {
      type: "session_started",
      session,
      history: session.history ?? [],
    };
  }
  if (msg.textDelta !== undefined) {
    return { type: "text_delta", delta: msg.textDelta.delta };
  }
  if (msg.awaitingInput !== undefined) {
    const awaiting = msg.awaitingInput;
    return {
      type: "awaiting_input",
      stopReason: awaiting.stopReason,
      stats: awaiting.stats,
      inputBlockedReason: awaiting.inputBlockedReason,
    };
  }
  if (msg.completed !== undefined) {
    const completed = msg.completed;
    return {
      type: "completed",
      stopReason: completed.stopReason,
      output: tryParseJsonBytes(completed.output),
      stats: completed.stats,
      sessionEndedAtUnixMs: completed.sessionEndedAtUnixMs,
    };
  }
  if (msg.failed !== undefined) {
    return { type: "failed", message: msg.failed.message };
  }
  if (msg.cancelled !== undefined) {
    return {
      type: "cancelled",
      sessionEndedAtUnixMs: msg.cancelled.sessionEndedAtUnixMs,
    };
  }
  if (msg.toolCall !== undefined) {
    const toolCall = msg.toolCall;
    return {
      type: "tool_call",
      callId: toolCall.callId,
      tool: toolCall.tool,
      version: toolCall.version,
      args: tryParseJsonBytes(toolCall.args),
    };
  }
  if (msg.toolResult !== undefined) {
    const toolResult = msg.toolResult;
    return {
      type: "tool_result",
      callId: toolResult.callId,
      payload: tryParseJsonBytes(toolResult.payload),
      errorMessage: toolResult.errorMessage,
    };
  }
  if (msg.approvalRequired !== undefined) {
    const approval = msg.approvalRequired;
    return {
      type: "approval_required",
      approval,
      args: tryParseJsonBytes(approval.args),
      policyRuntime: tryParseJsonBytes(approval.policyRuntime),
    };
  }
  return undefined;
}

function tryParseJsonBytes(bytes: Uint8Array | Buffer): unknown | undefined {
  if (bytes.length === 0) {
    return undefined;
  }
  try {
    return parseJsonBytes(bytes);
  } catch {
    return undefined;
  }
}
