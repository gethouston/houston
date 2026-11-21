import { EngineError } from "@houston/runtime-client";

export type ImportFailureKind = "aborted" | "failed";

export function classifyImportFailure(
  err: unknown,
  unloading: boolean,
): ImportFailureKind {
  if (err instanceof EngineError) return "failed";
  return unloading ? "aborted" : "failed";
}
