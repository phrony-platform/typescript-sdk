import type { WorkInvoke } from "../gen/phrony/runtime/v1/runtime.js";

/** Default max concurrent invocations per tool when unset (matches runtime playground). */
export const DEFAULT_MAX_CONCURRENCY = 4;

/** Structured tool failure returned to the runtime (maps to `WorkToolError`). */
export class ToolError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ToolError";
    this.code = code;
  }
}

/** Context passed to tool handlers for cancellation and call metadata. */
export type ToolHandlerContext = {
  callId: string;
  sessionId: string;
  agentVersionId: string;
  turn: number;
  tool: string;
  version: string;
  sideEffectClass: string;
  /** Aborted when the runtime sends `WorkToolCancel` or the invoke deadline passes. */
  signal: AbortSignal;
  invoke: WorkInvoke;
};

export type ToolHandler<TArgs = unknown, TResult = unknown> = (
  args: TArgs,
  context: ToolHandlerContext,
) => Promise<TResult> | TResult;

export type RegisteredTool = {
  tool: string;
  version: string;
  contractVersion?: string;
  descriptorHash?: string;
  maxConcurrency?: number;
  handler: ToolHandler;
};

export type RegisterToolOptions<TArgs = unknown, TResult = unknown> = {
  tool: string;
  version: string;
  contractVersion?: string;
  descriptorHash?: string;
  maxConcurrency?: number;
  handler: ToolHandler<TArgs, TResult>;
};

export type WorkerOptions = {
  /** @default process.env.PHRONY_RUNTIME_ADDR ?? "127.0.0.1:7777" */
  runtimeAddr?: string;
  workerId: string;
  workloadIdentity?: string;
  imageDigest?: string;
};

/** Stable registry key for a tool binding (`tool@version`). */
export function handlerKey(tool: string, version: string): string {
  return `${tool}@${version}`;
}

/** Heartbeat interval from lease TTL (half the TTL, minimum 1s; default TTL 30s). */
export function heartbeatIntervalMs(leaseTtlMs: number): number {
  const ttlMs = leaseTtlMs > 0 ? leaseTtlMs : 30_000;
  return Math.max(Math.floor(ttlMs / 2), 1_000);
}
