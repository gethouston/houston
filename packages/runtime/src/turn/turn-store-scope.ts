import { STARTUP_FOLDERS } from "./turn-deferred-rule";

export const UNLISTED_ROOT_DIRS: ReadonlySet<string> = new Set([
  ".pnpm-store",
  "claude-login",
]);

export interface ClaimedStoreScope {
  agentRoot: string;
  conversation: string;
  critical(rel: string): boolean;
  later(rel: string): boolean;
  laterFolder(dir: string): boolean;
}

export function claimedStoreScope(
  agentRoot: string,
  conversationId: string,
): ClaimedStoreScope {
  const root = `${agentRoot}/`;
  const runtime = `${root}.houston/runtime/`;
  const conversation = `${runtime}conversations/${encodeURIComponent(conversationId)}.json`;
  const archive = `${runtime}conversations/${encodeURIComponent(conversationId)}.archive/`;
  const session = `${runtime}sessions/${conversationId}/`;
  const later = (rel: string) => {
    if (!rel.startsWith(root)) return false;
    const segments = rel.slice(root.length).split("/");
    return segments.length > 1 && !STARTUP_FOLDERS.has(segments[0] ?? "");
  };
  const critical = (rel: string) => {
    if (!rel.startsWith(root)) {
      const [top, ...rest] = rel.split("/");
      return rest.length === 0 || !UNLISTED_ROOT_DIRS.has(top ?? "");
    }
    if (later(rel)) return false;
    for (const folder of ["conversations/", "sessions/"]) {
      if (!rel.startsWith(runtime + folder)) continue;
      return rel.startsWith(archive) || rel.startsWith(session);
    }
    return true;
  };
  return {
    agentRoot,
    conversation,
    critical,
    later,
    laterFolder: (dir) =>
      later(`${dir}/file`) && !dir.slice(root.length).includes("/"),
  };
}
