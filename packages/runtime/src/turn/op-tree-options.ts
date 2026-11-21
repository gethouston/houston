import { basename } from "node:path";
import { STORE_ROOT_PACKAGE_EXCLUDES } from "@houston/runtime-client/object-sync";
import { credentialOpFiles } from "./op-credential";
import type { AgentOp } from "./op-grammar";
import { settingsOpFiles } from "./op-settings";

export const AGENT_OPS_CLAIM_ID = "agent-ops";

export const AGENT_IMPORT_CLAIM_ID = "agent-import";

const ROUTE_OP_EXCLUDES = ["workspaces/*/*/.houston/runtime/"];
const SETTINGS_OP_EXCLUDES = [
  ...STORE_ROOT_PACKAGE_EXCLUDES,
  "workspaces/*/*/.houston/runtime/conversations/",
  "workspaces/*/*/.houston/runtime/sessions/",
  "workspaces/*/*/files/",
  "workspaces/*/*/uploads/",
];
const SETTINGS_OP_RUNTIME_FILES = new Set(
  [...settingsOpFiles("."), ...credentialOpFiles(".")].map((file) =>
    basename(file),
  ),
);
const settingsOpDownloads = (rel: string): boolean => {
  const s = rel.split("/");
  const file =
    s[0] === "workspaces" &&
    s.length === 6 &&
    s[3] === ".houston" &&
    s[4] === "runtime"
      ? s[5]
      : s[0] === "data" && s.length === 2
        ? s[1]
        : undefined;
  return file !== undefined && SETTINGS_OP_RUNTIME_FILES.has(file);
};

export function isMigrationImport(op: AgentOp): boolean {
  return (
    op.kind === "route" && decodeURIComponent(op.rest) === "migration/import"
  );
}

export function opClaimId(op: AgentOp): string {
  if (op.kind === "conversation" || op.kind === "reconcile")
    return op.conversationId;
  return isMigrationImport(op) ? AGENT_IMPORT_CLAIM_ID : AGENT_OPS_CLAIM_ID;
}

export function importListed(rel: string): boolean {
  const s = rel.split("/");
  const runtime =
    s[0] === "workspaces" && s[3] === ".houston" && s[4] === "runtime";
  if (!runtime || s.length < 6) return true;
  return (s[5] === "conversations" || s[5] === "sessions") && s.length > 6;
}

export function opTreeOptions(op: AgentOp): {
  excludes?: string[];
  filter?: (rel: string) => boolean;
  lazy?: boolean;
  admit?: (rel: string) => boolean;
} {
  if (isMigrationImport(op)) return { lazy: true, admit: importListed };
  switch (op.kind) {
    case "custom-oauth":
    case "first-day":
    case "route":
      return { excludes: ROUTE_OP_EXCLUDES, lazy: true };
    case "conversation":
    case "reconcile":
      return { lazy: true };
    case "settings":
    case "credential":
      return { excludes: SETTINGS_OP_EXCLUDES, filter: settingsOpDownloads };
    default:
      return {};
  }
}
