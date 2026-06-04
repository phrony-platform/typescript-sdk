import { describe, expect, it } from "vitest";
import { RuntimeClient } from "../client/runtime-client.js";
import { resolveRuntimeAddr } from "../client/dial.js";

const integrationEnabled = process.env.PHRONY_INTEGRATION === "1";

describe.skipIf(!integrationEnabled)("runtime integration", () => {
  it("getVersion reaches a running local runtime", async () => {
    const client = await RuntimeClient.connect({ address: resolveRuntimeAddr() });
    try {
      const version = await client.getVersion();
      expect(version.version).toBeTruthy();
    } finally {
      client.close();
    }
  });
});
