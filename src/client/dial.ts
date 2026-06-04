import {
  credentials,
  type ChannelCredentials,
  type ClientOptions,
} from "@grpc/grpc-js";
import { HealthClient } from "../gen/grpc/health/v1/health.js";
import { RuntimeClient as GrpcRuntimeClient } from "../gen/phrony/runtime/v1/runtime.js";

export const DEFAULT_RUNTIME_ADDR = "127.0.0.1:7777";

/** Resolve the runtime gRPC address (explicit value, then `PHRONY_RUNTIME_ADDR`, then default). */
export function resolveRuntimeAddr(address?: string): string {
  if (address) {
    return address;
  }
  return process.env.PHRONY_RUNTIME_ADDR ?? DEFAULT_RUNTIME_ADDR;
}

export type DialOptions = {
  address?: string;
  credentials?: ChannelCredentials;
  clientOptions?: Partial<ClientOptions>;
};

export type DialResult = {
  runtime: GrpcRuntimeClient;
  health: HealthClient;
  address: string;
  close(): void;
};

/** Open gRPC clients to the Phrony runtime (insecure credentials by default). */
export function dialRuntime(options?: DialOptions): DialResult {
  const address = resolveRuntimeAddr(options?.address);
  const channelCredentials = options?.credentials ?? credentials.createInsecure();
  const clientOptions = options?.clientOptions;

  const runtime = new GrpcRuntimeClient(address, channelCredentials, clientOptions);
  const health = new HealthClient(address, channelCredentials, clientOptions);

  return {
    runtime,
    health,
    address,
    close() {
      runtime.close();
      health.close();
    },
  };
}
