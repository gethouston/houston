import { orgSlugFromWorkspaceId } from "./space-id";

export function detectTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz?.length) return tz;
  } catch {}
  return "UTC";
}

export function timezoneOwner(
  uid: string | null,
  identityConfigured: boolean,
  workspaceId: string | null,
): string | null {
  const person = identityConfigured ? uid : "local";
  if (!person || !workspaceId) return null;
  return `${person}:${orgSlugFromWorkspaceId(workspaceId) ?? "personal"}`;
}
