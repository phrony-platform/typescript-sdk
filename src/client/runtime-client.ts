import type {
  CallOptions,
  ChannelCredentials,
  ClientDuplexStream,
  ClientOptions,
  Metadata,
} from "@grpc/grpc-js";
import type { HealthClient } from "../gen/grpc/health/v1/health.js";
import {
  RuntimeClient as GrpcRuntimeClient,
  GetVersionRequest as GetVersionRequestMsg,
  ListAgentsRequest as ListAgentsRequestMsg,
  ListApprovalsRequest as ListApprovalsRequestMsg,
  type AgentRef,
  type Approval,
  type ArchiveAgentRequest,
  type ArchiveAgentResponse,
  type CancelSessionRequest,
  type CancelSessionResponse,
  type CompleteSessionRequest,
  type CompleteSessionResponse,
  type DecideApprovalRequest,
  type DecideApprovalResponse,
  type DeployRequest,
  type DeployResponse,
  type DeprecateAgentVersionRequest,
  type DeprecateAgentVersionResponse,
  type GetActiveVersionRequest,
  type GetActiveVersionResponse,
  type GetAgentVersionRequest,
  type GetAgentVersionResponse,
  type GetApprovalRequest,
  type GetVersionRequest,
  type GetVersionResponse,
  type ListAgentVersionsRequest,
  type ListAgentVersionsResponse,
  type ListAgentsRequest,
  type ListAgentsResponse,
  type ListApprovalsRequest,
  type ListApprovalsResponse,
  type ListDeploymentsRequest,
  type ListDeploymentsResponse,
  type ListSessionsRequest,
  type ListSessionsResponse,
  type PublishRequest,
  type PublishResponse,
  type RetireAgentVersionRequest,
  type RetireAgentVersionResponse,
  type RollbackRequest,
  type RollbackResponse,
  type RunSessionInteractiveClientMsg,
  type RunSessionInteractiveServerMsg,
  type RunSessionRequest,
  type RunSessionResponse,
  type WorkClientMsg,
  type WorkServerMsg,
} from "../gen/phrony/runtime/v1/runtime.js";
import { dialRuntime } from "./dial.js";
import { callUnary } from "./unary.js";

export type { AgentRef };

export type RuntimeClientOptions = {
  /** @default process.env.PHRONY_RUNTIME_ADDR ?? "127.0.0.1:7777" */
  address?: string;
  /** @default insecure local dev credentials */
  credentials?: ChannelCredentials;
  clientOptions?: Partial<ClientOptions>;
};

/** Typed wrapper around the generated Phrony runtime gRPC client. */
export class RuntimeClient {
  private readonly grpc: GrpcRuntimeClient;
  private readonly healthClient: HealthClient;
  readonly address: string;

  private constructor(grpc: GrpcRuntimeClient, healthClient: HealthClient, address: string) {
    this.grpc = grpc;
    this.healthClient = healthClient;
    this.address = address;
  }

  static connect(options?: RuntimeClientOptions): Promise<RuntimeClient> {
    const dial = dialRuntime(options);
    return Promise.resolve(new RuntimeClient(dial.runtime, dial.health, dial.address));
  }

  close(): void {
    this.grpc.close();
    this.healthClient.close();
  }

  getVersion(request: GetVersionRequest = GetVersionRequestMsg.create()): Promise<GetVersionResponse> {
    return callUnary("get version", this.grpc.getVersion.bind(this.grpc), request);
  }

  runSession(request: RunSessionRequest): Promise<RunSessionResponse> {
    return callUnary("run session", this.grpc.runSession.bind(this.grpc), request);
  }

  publish(request: PublishRequest): Promise<PublishResponse> {
    return callUnary("publish agent", this.grpc.publish.bind(this.grpc), request);
  }

  deploy(request: DeployRequest): Promise<DeployResponse> {
    return callUnary("deploy agent", this.grpc.deploy.bind(this.grpc), request);
  }

  rollback(request: RollbackRequest): Promise<RollbackResponse> {
    return callUnary("rollback deployment", this.grpc.rollback.bind(this.grpc), request);
  }

  getActiveVersion(request: GetActiveVersionRequest): Promise<GetActiveVersionResponse> {
    return callUnary("get active version", this.grpc.getActiveVersion.bind(this.grpc), request);
  }

  listDeployments(request: ListDeploymentsRequest): Promise<ListDeploymentsResponse> {
    return callUnary("list deployments", this.grpc.listDeployments.bind(this.grpc), request);
  }

  getAgentVersion(request: GetAgentVersionRequest): Promise<GetAgentVersionResponse> {
    return callUnary("get agent version", this.grpc.getAgentVersion.bind(this.grpc), request);
  }

  retireAgentVersion(request: RetireAgentVersionRequest): Promise<RetireAgentVersionResponse> {
    return callUnary("retire agent version", this.grpc.retireAgentVersion.bind(this.grpc), request);
  }

  cancelSession(request: CancelSessionRequest): Promise<CancelSessionResponse> {
    return callUnary("cancel session", this.grpc.cancelSession.bind(this.grpc), request);
  }

  completeSession(request: CompleteSessionRequest): Promise<CompleteSessionResponse> {
    return callUnary("complete session", this.grpc.completeSession.bind(this.grpc), request);
  }

  listAgents(request: ListAgentsRequest = ListAgentsRequestMsg.create()): Promise<ListAgentsResponse> {
    return callUnary("list agents", this.grpc.listAgents.bind(this.grpc), request);
  }

  listAgentVersions(request: ListAgentVersionsRequest): Promise<ListAgentVersionsResponse> {
    return callUnary("list agent versions", this.grpc.listAgentVersions.bind(this.grpc), request);
  }

  listSessions(request: ListSessionsRequest): Promise<ListSessionsResponse> {
    return callUnary("list sessions", this.grpc.listSessions.bind(this.grpc), request);
  }

  getApproval(request: GetApprovalRequest): Promise<Approval> {
    return callUnary("get approval", this.grpc.getApproval.bind(this.grpc), request);
  }

  listApprovals(
    request: ListApprovalsRequest = ListApprovalsRequestMsg.create(),
  ): Promise<ListApprovalsResponse> {
    return callUnary("list approvals", this.grpc.listApprovals.bind(this.grpc), request);
  }

  decideApproval(request: DecideApprovalRequest): Promise<DecideApprovalResponse> {
    return callUnary("decide approval", this.grpc.decideApproval.bind(this.grpc), request);
  }

  deprecateAgentVersion(
    request: DeprecateAgentVersionRequest,
  ): Promise<DeprecateAgentVersionResponse> {
    return callUnary(
      "deprecate agent version",
      this.grpc.deprecateAgentVersion.bind(this.grpc),
      request,
    );
  }

  archiveAgent(request: ArchiveAgentRequest): Promise<ArchiveAgentResponse> {
    return callUnary("archive agent", this.grpc.archiveAgent.bind(this.grpc), request);
  }

  /** Open the bidirectional worker stream (`Runtime.Work`). */
  work(
    metadata?: Metadata,
    options?: Partial<CallOptions>,
  ): ClientDuplexStream<WorkClientMsg, WorkServerMsg> {
    if (metadata !== undefined) {
      return this.grpc.work(metadata, options);
    }
    if (options !== undefined) {
      return this.grpc.work(options);
    }
    return this.grpc.work();
  }

  /** Open the bidirectional interactive session stream (`Runtime.RunSessionInteractive`). */
  runSessionInteractive(
    metadata?: Metadata,
    options?: Partial<CallOptions>,
  ): ClientDuplexStream<RunSessionInteractiveClientMsg, RunSessionInteractiveServerMsg> {
    if (metadata !== undefined) {
      return this.grpc.runSessionInteractive(metadata, options);
    }
    if (options !== undefined) {
      return this.grpc.runSessionInteractive(options);
    }
    return this.grpc.runSessionInteractive();
  }

  /** Standard gRPC health client on the same runtime address. */
  health(): HealthClient {
    return this.healthClient;
  }
}
