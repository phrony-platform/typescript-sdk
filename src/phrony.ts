import type { ChannelCredentials } from "@grpc/grpc-js";
import { parseAgentRef } from "./agent-ref.js";
import { jsonBytes, jsonBytesMap } from "./client/json-bytes.js";
import { RuntimeClient } from "./client/runtime-client.js";
import type { AgentRef, InteractiveSessionStats } from "./gen/phrony/runtime/v1/runtime.js";
import { InteractiveSession } from "./session/interactive-session.js";
import type { InteractiveEvent } from "./session/types.js";

export type PhronyOptions = {
  /** @default process.env.PHRONY_RUNTIME_ADDR ?? "127.0.0.1:7777" */
  runtimeAddr?: string;
  credentials?: ChannelCredentials;
};

export type AgentRunOptions = {
  /** JSON-serializable session input. */
  input?: unknown;
  /** Resolved secret values keyed by manifest secret name. */
  resolvedSecrets?: Record<string, unknown>;
  /**
   * Agent version (alternative to `namespace/name@version` on {@link Phrony.agent}).
   * When set, overrides the version from the agent reference string.
   */
  version?: string;
  /**
   * When `false`, starts the session via unary `RunSession` and returns immediately
   * with the session id. When `true` (default), opens an interactive stream and
   * waits until the session completes.
   */
  wait?: boolean;
};

export type AgentRunResult = {
  sessionId: string;
  agentVersionId?: string;
  /** Present when `wait` is true and the session completed successfully. */
  output?: unknown;
  stopReason?: string;
  stats?: InteractiveSessionStats;
  /** Present when `wait` is false (`RunSession` response status). */
  status?: string;
};

/** Error thrown when an agent session fails or ends without a successful completion. */
export class AgentSessionError extends Error {
  constructor(
    message: string,
    readonly sessionId?: string,
  ) {
    super(message);
    this.name = "AgentSessionError";
  }
}

/** High-level SDK entry for running agents against a local Phrony runtime. */
export class Phrony {
  private client: RuntimeClient | undefined;
  private readonly options: PhronyOptions;

  constructor(options: PhronyOptions = {}) {
    this.options = options;
  }

  /** Connect to the runtime and return a connected {@link Phrony} instance. */
  static async connect(options?: PhronyOptions): Promise<Phrony> {
    const phrony = new Phrony(options ?? {});
    await phrony.ensureClient();
    return phrony;
  }

  /** Close the underlying gRPC client. */
  close(): void {
    this.client?.close();
    this.client = undefined;
  }

  /**
   * Return a handle for `namespace/name` or `namespace/name@version`.
   * A bare name without a slash is rejected; use `default/my-agent` form.
   */
  agent(ref: string): PhronyAgent {
    return new PhronyAgent(this, parseAgentRef(ref));
  }

  /** Underlying runtime client (connects lazily on first use). */
  async runtimeClient(): Promise<RuntimeClient> {
    return this.ensureClient();
  }

  async ensureClient(): Promise<RuntimeClient> {
    if (this.client === undefined) {
      this.client = await RuntimeClient.connect({
        address: this.options.runtimeAddr,
        credentials: this.options.credentials,
      });
    }
    return this.client;
  }
}

/** Bound agent reference with {@link run} and {@link runInteractive} helpers. */
export class PhronyAgent {
  constructor(
    private readonly phrony: Phrony,
    readonly ref: AgentRef,
  ) {}

  /**
   * Start a session for this agent. By default waits for completion and returns
   * parsed output. Set `wait: false` to fire-and-forget via unary `RunSession`.
   */
  async run(options: AgentRunOptions = {}): Promise<AgentRunResult> {
    const agentRef = applyVersionOverride(this.ref, options.version);
    const client = await this.phrony.ensureClient();

    if (options.wait === false) {
      const response = await client.runSession({
        agentRef,
        input: encodeInput(options.input),
        resolvedSecrets: jsonBytesMap(options.resolvedSecrets ?? {}),
      });
      return {
        sessionId: response.sessionId,
        agentVersionId: response.agentVersionId,
        status: response.status,
      };
    }

    return runToCompletion(client, agentRef, options);
  }

  /**
   * Open a bidirectional interactive stream for this agent without waiting for
   * completion. The caller consumes {@link InteractiveSession.events} and must
   * {@link InteractiveSession.close} when finished.
   */
  async runInteractive(
    options: Pick<AgentRunOptions, "input" | "resolvedSecrets" | "version"> = {},
  ): Promise<InteractiveSession> {
    const client = await this.phrony.ensureClient();
    const session = client.runSessionInteractive();
    session.start({
      agentRef: applyVersionOverride(this.ref, options.version),
      input: options.input ?? {},
      resolvedSecrets: options.resolvedSecrets,
    });
    return session;
  }
}

async function runToCompletion(
  client: RuntimeClient,
  agentRef: AgentRef,
  options: AgentRunOptions,
): Promise<AgentRunResult> {
  const session = client.runSessionInteractive();
  session.start({
    agentRef,
    input: options.input ?? {},
    resolvedSecrets: options.resolvedSecrets,
  });

  let sessionId = "";
  let agentVersionId: string | undefined;

  try {
    for await (const event of session.events()) {
      if (event.type === "session_started") {
        sessionId = event.session.sessionId;
        agentVersionId = event.session.agentVersionId;
        continue;
      }

      if (event.type === "completed") {
        return {
          sessionId,
          agentVersionId,
          output: event.output,
          stopReason: event.stopReason,
          stats: event.stats,
        };
      }

      if (event.type === "failed") {
        throw new AgentSessionError(event.message, sessionId || undefined);
      }

      if (event.type === "cancelled") {
        throw new AgentSessionError(
          sessionId ? `session ${sessionId} cancelled` : "session cancelled",
          sessionId || undefined,
        );
      }
    }

    throw new AgentSessionError(
      sessionId ? `session ${sessionId} ended without completing` : "session ended without completing",
      sessionId || undefined,
    );
  } finally {
    session.close();
  }
}

function applyVersionOverride(ref: AgentRef, version?: string): AgentRef {
  if (version === undefined) {
    return ref;
  }
  return { ...ref, version };
}

function encodeInput(input: unknown | undefined): Buffer {
  if (input === undefined) {
    return Buffer.alloc(0);
  }
  return jsonBytes(input);
}

export type { InteractiveEvent };
