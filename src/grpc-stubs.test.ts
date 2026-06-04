import { describe, expect, it } from "vitest";
import { HealthClient, HealthService } from "./gen/grpc/health/v1/health.js";
import { RuntimeClient, RuntimeService } from "./gen/phrony/runtime/v1/runtime.js";

describe("generated gRPC stubs", () => {
  it("exports RuntimeClient with all Runtime RPCs", () => {
    expect(RuntimeClient.service).toBe(RuntimeService);
    expect(Object.keys(RuntimeService)).toHaveLength(21);
    expect(RuntimeService.getVersion.path).toBe("/phrony.runtime.v1.Runtime/GetVersion");
    expect(RuntimeService.work.requestStream).toBe(true);
    expect(RuntimeService.runSessionInteractive.responseStream).toBe(true);
  });

  it("exports HealthClient with standard health RPCs", () => {
    expect(HealthClient.service).toBe(HealthService);
    expect(Object.keys(HealthService)).toEqual(["check", "list", "watch"]);
    expect(HealthService.check.path).toBe("/grpc.health.v1.Health/Check");
  });
});
