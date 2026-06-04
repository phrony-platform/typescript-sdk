import type { ClientDuplexStream } from "@grpc/grpc-js";
import { jsonBytes, parseJsonBytes } from "../client/json-bytes.js";
import type { WorkClientMsg, WorkInvoke, WorkServerMsg } from "../gen/phrony/runtime/v1/runtime.js";
import { buildHandlerAdvertisements, WorkStream } from "./work-stream.js";
import { ToolError, handlerKey, type RegisteredTool, type WorkerOptions } from "./types.js";

export type WorkerRuntimeClient = {
  work(): ClientDuplexStream<WorkClientMsg, WorkServerMsg>;
  close(): void;
};

type InFlightExecution = {
  abortController: AbortController;
};

export type WorkerSession = {
  close(): Promise<void>;
  done: Promise<void>;
};

/** Run the worker Work-stream session until closed or the stream ends. */
export function runWorkerSession(
  client: WorkerRuntimeClient,
  options: WorkerOptions,
  handlers: Map<string, RegisteredTool>,
): WorkerSession {
  const grpcStream = client.work();
  const workStream = new WorkStream(grpcStream);
  const executions = new Map<string, InFlightExecution>();
  let connected = true;
  let closing = false;
  let sessionDone: (() => void) | undefined;
  let sessionError: ((error: Error) => void) | undefined;

  const done = new Promise<void>((resolve, reject) => {
    sessionDone = resolve;
    sessionError = reject;

    workStream.run({
      onInvoke: (invoke) => {
        void dispatchInvoke(workStream, handlers, executions, invoke);
      },
      onCancel: (callId) => {
        executions.get(callId)?.abortController.abort();
      },
      onError: (error) => {
        if (closing) {
          finishSession();
          return;
        }
        sessionError?.(error);
      },
      onEnd: () => {
        finishSession();
      },
    });

    workStream.sendRegister({
      workerId: options.workerId,
      workloadIdentity: options.workloadIdentity ?? "",
      imageDigest: options.imageDigest ?? "",
      handlers: buildHandlerAdvertisements(handlers.values()),
      inFlight: workStream.inFlightCalls().map((callId) => ({ callId })),
    });
  });

  function finishSession(): void {
    if (!connected && closing) {
      sessionDone?.();
      return;
    }
    connected = false;
    client.close();
    sessionDone?.();
  }

  return {
    done,
    async close(): Promise<void> {
      if (!connected || closing) {
        return;
      }
      closing = true;
      for (const execution of executions.values()) {
        execution.abortController.abort();
      }
      workStream.close();
      client.close();
      connected = false;
    },
  };
}

async function dispatchInvoke(
  workStream: WorkStream,
  handlers: Map<string, RegisteredTool>,
  executions: Map<string, InFlightExecution>,
  invoke: WorkInvoke,
): Promise<void> {
  const key = handlerKey(invoke.tool, invoke.version);
  const registration = handlers.get(key);
  if (registration === undefined) {
    workStream.sendNack({
      callId: invoke.callId,
      code: "unknown_handler",
      message: `no handler registered for ${key}`,
    });
    return;
  }

  let args: unknown;
  try {
    args = invoke.args.length === 0 ? {} : parseJsonBytes(invoke.args);
  } catch (error) {
    workStream.sendNack({
      callId: invoke.callId,
      code: "invalid_args",
      message: error instanceof Error ? error.message : "failed to parse invoke args",
    });
    return;
  }

  const abortController = new AbortController();
  const deadlineMs = invoke.deadlineUnixMs;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  if (deadlineMs > 0) {
    const delayMs = deadlineMs - Date.now();
    if (delayMs <= 0) {
      abortController.abort();
    } else {
      deadlineTimer = setTimeout(() => abortController.abort(), delayMs);
      deadlineTimer.unref?.();
    }
  }

  workStream.markCallExecuting(invoke.callId);
  executions.set(invoke.callId, { abortController });

  const context = {
    callId: invoke.callId,
    sessionId: invoke.sessionId,
    agentVersionId: invoke.agentVersionId,
    turn: invoke.turn,
    tool: invoke.tool,
    version: invoke.version,
    sideEffectClass: invoke.sideEffectClass,
    signal: abortController.signal,
    invoke,
  };

  try {
    const result = await registration.handler(args, context);
    if (abortController.signal.aborted) {
      sendCancelledResult(workStream, invoke.callId);
      return;
    }
    workStream.sendResult({
      callId: invoke.callId,
      payload: jsonBytes(result),
    });
  } catch (error) {
    if (abortController.signal.aborted) {
      sendCancelledResult(workStream, invoke.callId);
      return;
    }
    if (error instanceof ToolError) {
      workStream.sendResult({
        callId: invoke.callId,
        payload: Buffer.alloc(0),
        error: { code: error.code, message: error.message },
      });
      return;
    }
    const message = error instanceof Error ? error.message : "handler failed";
    workStream.sendResult({
      callId: invoke.callId,
      payload: Buffer.alloc(0),
      error: { code: "internal", message },
    });
  } finally {
    if (deadlineTimer !== undefined) {
      clearTimeout(deadlineTimer);
    }
    executions.delete(invoke.callId);
  }
}

function sendCancelledResult(workStream: WorkStream, callId: string): void {
  workStream.sendResult({
    callId,
    payload: Buffer.alloc(0),
    error: { code: "cancelled", message: "invoke cancelled or deadline exceeded" },
  });
}
