import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_CONCURRENCY,
  handlerKey,
  heartbeatIntervalMs,
} from "./types.js";

describe("worker types", () => {
  it("builds handler keys as tool@version", () => {
    expect(handlerKey("weather.get-forecast", "1.0.0")).toBe("weather.get-forecast@1.0.0");
  });

  it("computes heartbeat interval as half the lease TTL with a 1s floor", () => {
    expect(heartbeatIntervalMs(60_000)).toBe(30_000);
    expect(heartbeatIntervalMs(1_000)).toBe(1_000);
    expect(heartbeatIntervalMs(0)).toBe(15_000);
  });

  it("exports default max concurrency matching the runtime playground", () => {
    expect(DEFAULT_MAX_CONCURRENCY).toBe(4);
  });
});
