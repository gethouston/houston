import { HANDLE_REGEX, normalizeHandle } from "@houston/agentstore-contract";

export function resolveSearchTarget(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("@")) {
    const handle = normalizeHandle(trimmed);
    if (HANDLE_REGEX.test(handle)) return `/@${handle}`;
  }
  return trimmed ? `/?q=${encodeURIComponent(trimmed)}` : "/";
}
