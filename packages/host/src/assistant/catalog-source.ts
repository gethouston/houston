import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type AssistantCatalog, loadAssistantCatalog } from "./catalog";

/**
 * Where this PROCESS reads the assistant operation catalog from, and the single
 * cached read of it. Both the host's dispatcher and the runtime's assistant
 * tools resolve the path here so the two sides can never read different files.
 */

/**
 * The generated catalog as it sits in a source checkout (`pnpm
 * gen:assistant-catalog` writes it). The ONE place the default path is spelled.
 * A deployment that packages the file elsewhere — every container image does,
 * because the bundled entrypoint sits nowhere near the source tree — points
 * HOUSTON_ASSISTANT_CATALOG at it; a deployment that packages none simply has
 * no assistant family (the loader says so and moves on).
 */
export const DEFAULT_ASSISTANT_CATALOG_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../ui/engine-client/generated/assistant-catalog.json",
);

export function assistantCatalogPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env.HOUSTON_ASSISTANT_CATALOG || DEFAULT_ASSISTANT_CATALOG_PATH;
}

/**
 * `null` is a real, cacheable answer (no catalog packaged), so absence of the
 * cache — not a null catalog — is what marks "not read yet".
 */
let cached: { catalog: AssistantCatalog | null } | undefined;

/**
 * The catalog this process dispatches over, read once. Called at boot so the
 * loader's named "off" line lands in the startup log rather than in the first
 * unlucky request.
 */
export function processAssistantCatalog(
  env: NodeJS.ProcessEnv = process.env,
): AssistantCatalog | null {
  cached ??= { catalog: loadAssistantCatalog(assistantCatalogPath(env)) };
  return cached.catalog;
}
