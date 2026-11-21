export const AccountCommand = {
  GetProfile: "account/getProfile",
  SetProfile: "account/setProfile",
  ListKeys: "account/listKeys",
  CreateKey: "account/createKey",
  RevokeKey: "account/revokeKey",
} as const;

export type AccountCommandType =
  (typeof AccountCommand)[keyof typeof AccountCommand];

export interface EditableProfileCustom {
  displayName: boolean;
  photoUrl: boolean;
}

export interface EditableProfile {
  displayName?: string;
  photoUrl?: string;
  custom: EditableProfileCustom;
}

export interface EditableProfileUpdate {
  displayName?: string | null;
  photoUrl?: string | null;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
}

export interface ApiKeyCreated extends ApiKey {
  key: string;
}

export function profileUpdate(
  payload: unknown,
  key: string,
): EditableProfileUpdate {
  const value =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)[key]
      : undefined;
  if (typeof value !== "object" || value === null) {
    throw new Error(`missing '${key}'`);
  }
  const update: EditableProfileUpdate = {};
  for (const field of ["displayName", "photoUrl"] as const) {
    if (!(field in value)) continue;
    const raw = (value as Record<string, unknown>)[field];
    if (raw !== null && typeof raw !== "string") {
      throw new Error(`'${field}' must be a string or null`);
    }
    update[field] = raw;
  }
  return update;
}
