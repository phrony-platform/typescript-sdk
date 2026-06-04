#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const protoRoot = resolve(packageRoot, "../runtime/proto");
const outDir = join(packageRoot, "src/gen");
const plugin = join(packageRoot, "node_modules/ts-proto/protoc-gen-ts_proto");

const protoFiles = [
  "phrony/runtime/v1/runtime.proto",
  "grpc/health/v1/health.proto",
];

if (!existsSync(protoRoot)) {
  console.error(`Proto directory not found: ${protoRoot}`);
  process.exit(1);
}

if (!existsSync(plugin)) {
  console.error(
    "protoc-gen-ts_proto not found; run pnpm install in typescript-sdk first.",
  );
  process.exit(1);
}

if (existsSync(outDir)) {
  rmSync(outDir, { recursive: true, force: true });
}
mkdirSync(outDir, { recursive: true });

try {
  execFileSync(
    "protoc",
    [
      `--plugin=protoc-gen-ts_proto=${plugin}`,
      `--ts_proto_out=${outDir}`,
      "--ts_proto_opt=outputServices=grpc-js,env=node,esModuleInterop=true,useOptionals=messages",
      "-I",
      protoRoot,
      ...protoFiles.map((file) => join(protoRoot, file)),
    ],
    { stdio: "inherit" },
  );
} catch {
  console.error(
    "protoc failed; install protobuf (e.g. brew install protobuf) and retry.",
  );
  process.exit(1);
}

console.log(`Generated TypeScript stubs in ${outDir}`);
