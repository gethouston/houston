import { createHash } from "node:crypto";

export const CLAUDE_FLAGS_DIR = "claude-flags";

export function claudeFlagsFileName(userId: string): string {
  return `${createHash("sha256").update(userId).digest("hex").slice(0, 16)}.json`;
}
