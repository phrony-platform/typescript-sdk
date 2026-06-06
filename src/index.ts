/** Package version — bumped at publish time. */
export const SDK_VERSION = "0.0.0";

export {
  AgentRefParseError,
  formatAgentRef,
  parseAgentRef,
} from "./agent-ref.js";

export {
  BundleRefParseError,
  formatBundleRef,
  parseBundleRef,
  parseBundleRefVersionRequired,
} from "./bundle-ref.js";

export {
  AgentSessionError,
  Phrony,
  PhronyAgent,
  PhronyBundle,
} from "./phrony.js";
export type {
  AgentRunOptions,
  AgentRunResult,
  PhronyOptions,
} from "./phrony.js";

export {
  DEFAULT_RUNTIME_ADDR,
  PhronyRuntimeError,
  RuntimeClient,
  dialRuntime,
  jsonBytes,
  jsonBytesMap,
  parseJsonBytes,
  resolvedSecretsMap,
  resolveRuntimeAddr,
  wrapRpcError,
} from "./client/index.js";
export type {
  DialOptions,
  DialResult,
  GrpcStatusCode,
  RuntimeClientOptions,
} from "./client/index.js";

export {
  InteractiveSession,
} from "./session/index.js";
export type {
  InteractiveEvent,
  InteractiveSessionAttachOptions,
  InteractiveSessionStartOptions,
  InteractiveToolApprovalOptions,
} from "./session/index.js";

export {
  DEFAULT_MAX_CONCURRENCY,
  ToolError,
  Worker,
  handlerKey,
  heartbeatIntervalMs,
} from "./worker/index.js";
export type {
  RegisterToolOptions,
  ToolHandler,
  ToolHandlerContext,
  WorkerOptions,
} from "./worker/index.js";

export {
  ApprovalDecision,
  type AgentRef,
  type Approval,
  type BundleMemberPackage,
  type BundleRef,
  type BundleSummary,
  type BundleVersionSummary,
  type DeployBundleRequest,
  type DeployBundleResponse,
  type DeployRequest,
  type DeployResponse,
  type GetActiveBundleRequest,
  type GetActiveBundleResponse,
  type GetVersionResponse,
  type InspectSessionRequest,
  type InspectSessionResponse,
  type InspectTimelineEntry,
  type ListBundleDeploymentsRequest,
  type ListBundleDeploymentsResponse,
  type ListBundlesRequest,
  type ListBundlesResponse,
  type ListBundleVersionsRequest,
  type ListBundleVersionsResponse,
  type PublishBundleRequest,
  type PublishBundleResponse,
  type PublishRequest,
  type PublishResponse,
  type SessionAgentContext,
  type SessionEventEntry,
  type SessionInspect,
  type SessionOutputInspect,
  type SessionTurnInspect,
  type ToolInvocationEntry,
  type RunSessionRequest,
  type RunSessionResponse,
  type RunSessionInteractiveClientMsg,
  type RunSessionInteractiveServerMsg,
  type WorkClientMsg,
  type WorkServerMsg,
} from "./gen/phrony/runtime/v1/runtime.js";
