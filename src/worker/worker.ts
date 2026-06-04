import { RuntimeClient as RuntimeClientImpl } from "../client/runtime-client.js";
import {
  DEFAULT_MAX_CONCURRENCY,
  handlerKey,
  type RegisterToolOptions,
  type RegisteredTool,
  type WorkerOptions,
} from "./types.js";
import { runWorkerSession } from "./worker-session.js";

/** Application worker that registers tool handlers on the runtime Work stream. */
export class Worker {
  private readonly options: WorkerOptions;
  private readonly handlers = new Map<string, RegisteredTool>();
  private session: ReturnType<typeof runWorkerSession> | undefined;
  private connected = false;

  constructor(options: WorkerOptions) {
    this.options = options;
  }

  /** Register a tool handler before {@link connect}. */
  registerTool<TArgs = unknown, TResult = unknown>(
    options: RegisterToolOptions<TArgs, TResult>,
  ): this {
    if (this.connected) {
      throw new Error("cannot register tools after connect()");
    }
    const key = handlerKey(options.tool, options.version);
    if (this.handlers.has(key)) {
      throw new Error(`tool handler already registered: ${key}`);
    }
    this.handlers.set(key, {
      tool: options.tool,
      version: options.version,
      contractVersion: options.contractVersion,
      descriptorHash: options.descriptorHash,
      maxConcurrency: options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY,
      handler: options.handler as RegisteredTool["handler"],
    });
    return this;
  }

  /**
   * Dial the runtime, register handlers, and process invocations until {@link close}.
   * Resolves when the connection ends gracefully; rejects on unexpected stream errors.
   */
  async connect(): Promise<void> {
    if (this.connected) {
      throw new Error("worker is already connected");
    }
    if (this.handlers.size === 0) {
      throw new Error("register at least one tool handler before connect()");
    }

    const client = await RuntimeClientImpl.connect({ address: this.options.runtimeAddr });
    this.session = runWorkerSession(client, this.options, this.handlers);
    this.connected = true;
    return this.session.done;
  }

  /** Gracefully shut down: abort in-flight calls and close the Work stream. */
  async close(): Promise<void> {
    if (!this.connected) {
      return;
    }
    await this.session?.close();
    this.connected = false;
  }
}
