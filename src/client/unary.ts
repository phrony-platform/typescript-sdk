import type { ServiceError } from "@grpc/grpc-js";
import { wrapRpcError } from "./errors.js";

type UnaryCallback<TResponse> = (error: ServiceError | null, response: TResponse) => void;

type SimpleUnaryRpc<TRequest, TResponse> = (
  request: TRequest,
  callback: UnaryCallback<TResponse>,
) => unknown;

/** Promisify a generated grpc-js unary RPC and map failures to {@link PhronyRuntimeError}. */
export function callUnary<TRequest, TResponse>(
  action: string,
  method: SimpleUnaryRpc<TRequest, TResponse>,
  request: TRequest,
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    method(request, (error: ServiceError | null, response: TResponse) => {
      if (error) {
        reject(wrapRpcError(action, error));
        return;
      }
      resolve(response);
    });
  });
}
