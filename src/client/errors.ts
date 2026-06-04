import { status as grpcStatus } from "@grpc/grpc-js";
import type { ServiceError } from "@grpc/grpc-js";

/** gRPC status code names aligned with `@grpc/grpc-js` numeric codes. */
export type GrpcStatusCode = keyof typeof grpcStatus;

/** Error thrown when a Phrony runtime gRPC call fails. */
export class PhronyRuntimeError extends Error {
  readonly code: number;
  readonly grpcCode: GrpcStatusCode;
  readonly action: string;
  readonly details: string;

  constructor(action: string, serviceError: ServiceError) {
    const grpcCode = statusCodeName(serviceError.code);
    const message = formatRpcMessage(action, serviceError.message, grpcCode);
    super(message);
    this.name = "PhronyRuntimeError";
    this.action = action;
    this.code = serviceError.code;
    this.grpcCode = grpcCode;
    this.details = serviceError.details;
  }
}

function statusCodeName(code: number): GrpcStatusCode {
  const entry = Object.entries(grpcStatus).find(([, value]) => value === code);
  return (entry?.[0] ?? "UNKNOWN") as GrpcStatusCode;
}

function formatRpcMessage(action: string, rpcMessage: string, grpcCode: GrpcStatusCode): string {
  if (grpcCode === "UNIMPLEMENTED") {
    return `${action}: ${rpcMessage} (not implemented on this runtime yet)`;
  }
  return `${action}: ${rpcMessage} (${grpcCode})`;
}

/** Wrap a gRPC callback error in {@link PhronyRuntimeError}. */
export function wrapRpcError(action: string, err: unknown): PhronyRuntimeError {
  if (isServiceError(err)) {
    return new PhronyRuntimeError(action, err);
  }
  const message = err instanceof Error ? err.message : String(err);
  const fallback = Object.assign(new Error(`${action}: ${message}`), {
    name: "PhronyRuntimeError",
    action,
    code: grpcStatus.UNKNOWN,
    grpcCode: "UNKNOWN" as GrpcStatusCode,
    details: message,
  });
  return fallback as PhronyRuntimeError;
}

function isServiceError(err: unknown): err is ServiceError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as ServiceError).code === "number" &&
    "details" in err
  );
}
