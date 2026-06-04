import type {
  AgentRef,
  InteractiveConversationMessage,
  InteractiveSessionStats,
  RunSessionInteractiveApprovalRequired,
  RunSessionInteractiveSessionStarted,
  TokenUsage,
} from "../gen/phrony/runtime/v1/runtime.js";

export type InteractiveSessionStartOptions = {
  agentRef: AgentRef;
  /** JSON-serializable session input (encoded as proto `input` bytes). */
  input: unknown;
  /** Resolved secret values keyed by secret name (encoded as proto `bytes` entries). */
  resolvedSecrets?: Record<string, unknown>;
};

export type InteractiveSessionAttachOptions = {
  sessionId: string;
};

export type InteractiveToolApprovalOptions = {
  approvalId: string;
  approved: boolean;
  comment?: string;
  /** When set, replaces proposed tool arguments before dispatch. */
  args?: unknown;
};

/** Server events from `RunSessionInteractive`, as a discriminated union. */
export type InteractiveEvent =
  | {
      type: "session_started";
      session: RunSessionInteractiveSessionStarted;
      history: InteractiveConversationMessage[];
    }
  | { type: "text_delta"; delta: string }
  | {
      type: "awaiting_input";
      stopReason: string;
      stats?: InteractiveSessionStats;
      inputBlockedReason: string;
    }
  | {
      type: "completed";
      stopReason: string;
      output?: unknown;
      stats?: InteractiveSessionStats;
      sessionEndedAtUnixMs: number;
    }
  | { type: "failed"; message: string }
  | { type: "cancelled"; sessionEndedAtUnixMs: number }
  | {
      type: "tool_call";
      callId: string;
      tool: string;
      version: string;
      args?: unknown;
    }
  | {
      type: "tool_result";
      callId: string;
      payload?: unknown;
      errorMessage: string;
    }
  | {
      type: "approval_required";
      approval: RunSessionInteractiveApprovalRequired;
      args?: unknown;
      policyRuntime?: unknown;
    }
  | { type: "stream_end" };

export type { AgentRef, InteractiveConversationMessage, InteractiveSessionStats, TokenUsage };
