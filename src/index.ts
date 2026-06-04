/** Package version — bumped at publish time. */
export const SDK_VERSION = "0.0.0";

export {
  DEFAULT_RUNTIME_ADDR,
  PhronyRuntimeError,
  RuntimeClient,
  dialRuntime,
  jsonBytes,
  jsonBytesMap,
  parseJsonBytes,
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
  ApprovalDecision,
  type AgentRef,
  type Approval,
  type DeployRequest,
  type DeployResponse,
  type GetVersionResponse,
  type PublishRequest,
  type PublishResponse,
  type RunSessionRequest,
  type RunSessionResponse,
  type RunSessionInteractiveClientMsg,
  type RunSessionInteractiveServerMsg,
  type WorkClientMsg,
  type WorkServerMsg,
} from "./gen/phrony/runtime/v1/runtime.js";
