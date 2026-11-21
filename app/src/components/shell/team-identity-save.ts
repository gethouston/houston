import { sidebarGroupNameTooLong } from "@houston/protocol";

export function teamNameTooLong(name: string): boolean {
  return sidebarGroupNameTooLong(name.trim());
}

export interface TeamIdentityDraft {
  name: string;
  icon: string | undefined;
  colorId: string | undefined;
}

export function teamIdentitySaveWrites(
  seeded: TeamIdentityDraft,
  draft: TeamIdentityDraft,
): {
  rename?: string;
  patch?: { icon?: string | null; color?: string | null };
} {
  const trimmed = draft.name.trim();
  const patch = {
    ...(draft.icon !== seeded.icon ? { icon: draft.icon ?? null } : {}),
    ...(draft.colorId !== seeded.colorId
      ? { color: draft.colorId ?? null }
      : {}),
  };
  return {
    ...(trimmed && trimmed !== seeded.name ? { rename: trimmed } : {}),
    ...(Object.keys(patch).length > 0 ? { patch } : {}),
  };
}
