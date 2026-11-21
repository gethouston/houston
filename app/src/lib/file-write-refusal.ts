import { isAgentWarmingRefusal } from "./agent-warming-refusal.ts";
import { fileRefusal } from "./file-conflicts.ts";

export type FileWriteRefusal =
  | "name_taken"
  | "read_only"
  | "warming"
  | "failed";

export function classifyFileWriteRefusal(err: unknown): FileWriteRefusal {
  if (isAgentWarmingRefusal(err)) return "warming";
  return fileRefusal(err) ?? "failed";
}
