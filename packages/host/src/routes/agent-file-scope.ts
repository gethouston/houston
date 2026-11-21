import { FilePathError, safeRel } from "../turn/files-path";

const INTERNAL_DOCUMENT_PREFIXES: readonly string[] = [
  ".houston/activity/",
  ".houston/config/",
  ".houston/learnings/",
  ".houston/routines/",
  ".houston/routine_runs/",
  ".houston/skills/",
  ".agents/skills/",
  ".claude/skills/",
];

export function isServedDocument(rel: string): boolean {
  try {
    safeRel(rel);
    return true;
  } catch (error) {
    if (!(error instanceof FilePathError)) throw error;
    return INTERNAL_DOCUMENT_PREFIXES.some((prefix) => rel.startsWith(prefix));
  }
}

const READ_ONLY_DOCUMENT_PREFIXES: readonly string[] = [".houston/routines/"];

export const READ_ONLY_DOCUMENT_REFUSAL = {
  error: "routines are saved through the routines routes, not as a file",
  code: "path_not_allowed",
} as const;

export function isReadOnlyDocument(rel: string): boolean {
  return READ_ONLY_DOCUMENT_PREFIXES.some((prefix) => rel.startsWith(prefix));
}
