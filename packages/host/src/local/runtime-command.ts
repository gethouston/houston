import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface RuntimeCommandDeps {
  env?: NodeJS.ProcessEnv;
  execPath?: string;
  moduleUrl?: string;
  exists?: (path: string) => boolean;
}

export function runtimeCommand(deps: RuntimeCommandDeps = {}): string[] {
  const env = deps.env ?? process.env;
  const explicit = env.HOUSTON_RUNTIME_COMMAND;
  if (explicit) return explicit.split(" ").filter(Boolean);

  const selfBinary = env.HOUSTON_SIDECAR_BINARY;
  if (selfBinary) return [selfBinary];

  const currentDir = dirname(fileURLToPath(deps.moduleUrl ?? import.meta.url));
  const exists = deps.exists ?? existsSync;
  const bundledRuntimeMain = join(currentDir, "..", "runtime", "main.mjs");
  if (exists(bundledRuntimeMain)) {
    return [deps.execPath ?? process.execPath, bundledRuntimeMain];
  }

  const runtimeMain = join(
    currentDir,
    "..",
    "..",
    "..",
    "runtime",
    "src",
    "main.ts",
  );
  return [deps.execPath ?? process.execPath, "--import", "tsx", runtimeMain];
}
