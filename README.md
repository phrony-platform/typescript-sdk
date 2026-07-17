# @phrony/sdk

TypeScript client for the [Phrony runtime](https://github.com/phrony-platform/runtime) over gRPC. Use it to run agents, open interactive sessions, and register tool workers.

This package targets **Node.js 18+** and speaks the runtime API defined in `runtime/proto/phrony/runtime/v1/runtime.proto`. It is not the cloud HTTP control-plane client.

## Install

```bash
pnpm add @phrony/sdk
```

## Runtime address

By default the SDK dials `127.0.0.1:7777`. Override with the environment variable or options on each entrypoint:

```bash
export PHRONY_RUNTIME_ADDR=127.0.0.1:7777
```

Start the runtime locally (see the [runtime](https://github.com/phrony-platform/runtime) repo) before calling the SDK.

## Quick start

### Run an agent

```typescript
import { Phrony } from "@phrony/sdk";

const phrony = await Phrony.connect({
  runtimeAddr: process.env.PHRONY_RUNTIME_ADDR ?? "127.0.0.1:7777",
});

const result = await phrony.agent("default/my-agent").run({
  input: { claimId: "CLM-48219" },
});

console.log(result.sessionId, result.output);
phrony.close();
```

Agent references use `namespace/name` or `namespace/name@version`. Set `wait: false` on `run()` to start a session via unary `RunSession` and return immediately with the session id.

### Register a tool worker

```typescript
import { Worker } from "@phrony/sdk/worker";

const worker = new Worker({
  runtimeAddr: process.env.PHRONY_RUNTIME_ADDR ?? "127.0.0.1:7777",
  workerId: "weather-worker-1",
});

worker.registerTool({
  tool: "weather.get-forecast",
  version: "1.0.0",
  maxConcurrency: 4,
  handler: async (args) => ({ temp_c: 12, city: (args as { city: string }).city }),
});

await worker.connect(); // blocks until disconnect
await worker.close();
```

Workers connect on the bidirectional `Work` stream: register handlers, heartbeats, invoke/result, and graceful shutdown. Register all tools before `connect()`.

### Low-level gRPC client

For full control over unary RPCs and streams:

```typescript
import { RuntimeClient } from "@phrony/sdk";

const client = await RuntimeClient.connect();
const version = await client.getVersion();
console.log(version.version);

const session = client.runSessionInteractive();
session.start({
  agentRef: { namespace: "default", name: "my-agent", version: "" },
  input: { question: "hello" },
});

for await (const event of session.events()) {
  if (event.type === "text_delta") {
    process.stdout.write(event.delta);
  }
  if (event.type === "completed") {
    console.log(event.output);
  }
}

session.close();
client.close();
```

Proto `bytes` fields that carry JSON (`input`, `args`, `payload`, and similar) are handled via `jsonBytes` and `parseJsonBytes` from the main export.

## Development

Prerequisites:

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/)
- [protobuf](https://protobuf.dev/) (`protoc`) when regenerating stubs — e.g. `brew install protobuf`

```bash
pnpm install
pnpm proto    # regenerate src/gen from ../runtime/proto
pnpm build
pnpm test
```

Integration tests (require a running runtime on the configured address):

```bash
PHRONY_INTEGRATION=1 pnpm test:integration
```

From the runtime repo you can bring up a local daemon (for example `make dev-up`) and point `PHRONY_RUNTIME_ADDR` at it.

## Scope and limitations

- **Local dev** uses insecure gRPC by default; pass `credentials` in client options when you add TLS later.
- **Agent manifests** and compile/publish flows live outside this package.

## License

MIT
