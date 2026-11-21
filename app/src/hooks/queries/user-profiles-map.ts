export interface UserProfile {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
}

export function normalizeUserIds(ids: string[]): string[] {
  return Array.from(new Set(ids)).sort();
}

export function profilesQueryEnabled(input: {
  idCount: number;
  authConfigured: boolean;
  multiplayer: boolean;
  alwaysEnabled: boolean;
}): boolean {
  const { idCount, authConfigured, multiplayer, alwaysEnabled } = input;
  return idCount > 0 && authConfigured && (alwaysEnabled || multiplayer);
}

export function mapProfilesResult(
  profiles: Record<string, { displayName?: string; photoUrl?: string }>,
): Map<string, UserProfile> {
  const map = new Map<string, UserProfile>();
  for (const [userId, p] of Object.entries(profiles)) {
    map.set(userId, {
      userId,
      name: p.displayName ?? null,
      avatarUrl: p.photoUrl ?? null,
    });
  }
  return map;
}

export interface SessionUserMeta {
  name?: string;
  full_name?: string;
  avatar_url?: string;
}

export interface MyProfile {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

export function resolveMyProfile(input: {
  userId: string;
  email?: string | null;
  metadata: SessionUserMeta;
  profile?: UserProfile | null;
}): MyProfile {
  const { userId, email, metadata, profile } = input;
  return {
    userId,
    name:
      profile?.name ??
      metadata.full_name ??
      metadata.name ??
      email ??
      userId.slice(0, 8),
    avatarUrl: profile?.avatarUrl ?? metadata.avatar_url ?? null,
  };
}

export function avatarUrlFromProfiles(
  profiles: ReadonlyMap<string, UserProfile>,
  userId: string,
): string | null {
  return profiles.get(userId)?.avatarUrl ?? null;
}
