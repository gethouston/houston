import { jobDescriptionRole } from "@houston/domain";
import type { Vfs } from "../vfs";

/** The file an agent's job description lives in, relative to its root. */
export const JOB_DESCRIPTION_FILE = "CLAUDE.md";

/**
 * The role an agent's job description names, read from its own file, or
 * `undefined` when the file is absent or names none. The one read behind the
 * listing's `role` and the role document a gateway-fronted pod publishes, so
 * the two can never name different roles for the same file.
 */
export async function readAgentRole(
  vfs: Vfs,
  agentRoot: string,
): Promise<string | undefined> {
  return jobDescriptionRole(
    await vfs.readText(`${agentRoot}/${JOB_DESCRIPTION_FILE}`),
  );
}
