import { readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "../..");
const adapter = join(repoRoot, "packages/web/src/engine-adapter");
const sdkModules = join(repoRoot, "packages/sdk/src/modules");
const generatedDocs = join(packageRoot, "generated");
const hostAssistant = join(repoRoot, "packages/host/src/assistant");
const domainSource = join(repoRoot, "packages/domain/src");

/** Every non-test `.ts` in `directory` that `matches`, sorted for determinism. */
function sourcesIn(
  directory: string,
  matches: (name: string) => boolean,
): string[] {
  return readdirSync(directory)
    .filter(
      (name) =>
        name.endsWith(".ts") && !name.endsWith(".test.ts") && matches(name),
    )
    .sort()
    .map((name) => join(directory, name));
}

export const assistantPaths = {
  /**
   * The live client surface: the control-plane modules that issue the requests,
   * the cluster mixins the app calls them through, and the SDK's own REST
   * modules (the write path every surface binds). `cp/fetch.ts` is not a source
   * — it holds the transport itself — but it is read for the shared path
   * helpers (`agentPath`) the modules build their paths from.
   */
  operationSources: [
    ...sourcesIn(join(adapter, "cp"), (name) => name !== "fetch.ts"),
    ...sourcesIn(join(adapter, "client"), (name) => name.endsWith("-mixin.ts")),
    // LAST on purpose: the SDK implements the writes the mixins delegate to it,
    // and a few reads the control plane also serves. Names collide there, and
    // first source wins — so the control-plane copy stays canonical and the SDK
    // contributes only the operations nothing else implements.
    join(sdkModules, "activities", "http.ts"),
    join(sdkModules, "agents", "http.ts"),
  ],
  transportSource: join(adapter, "cp", "fetch.ts"),
  biome: join(repoRoot, "node_modules/.bin/biome"),
  repo: repoRoot,
};

/**
 * Every file one generation writes, with the committed copy's home. The catalog
 * lands in the HOST package because the host imports it as a module: embedded at
 * build time, it travels inside the container bundle and the Bun-compiled
 * desktop sidecar alike, so no artifact has to locate a file it cannot reach.
 * The capability index lands in DOMAIN for the same reason: the runtime folds
 * it into the coordinator's system prompt, so it must be a module both the
 * container bundle and the desktop sidecar carry. The two documents are for
 * people and stay beside the client they describe.
 */
export const assistantOutputs = [
  { file: "assistant-catalog.generated.json", directory: hostAssistant },
  { file: "assistant-capability-index.generated.ts", directory: domainSource },
  { file: "assistant-capabilities.md", directory: generatedDocs },
  { file: "assistant-coverage.md", directory: generatedDocs },
  { file: "assistant-operations.md", directory: generatedDocs },
] as const;

/** A source path as it reads in the generated header — repo-relative, POSIX. */
export function repoRelative(path: string): string {
  return relative(repoRoot, path).split(/[\\/]/).join("/");
}
