import { jobDescriptionRole } from "@houston/domain";
import type { Vfs } from "../vfs";

export const JOB_DESCRIPTION_FILE = "CLAUDE.md";

export async function readAgentRole(
  vfs: Vfs,
  agentRoot: string,
): Promise<string | undefined> {
  return jobDescriptionRole(
    await vfs.readText(`${agentRoot}/${JOB_DESCRIPTION_FILE}`),
  );
}
