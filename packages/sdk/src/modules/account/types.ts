/**
 * Wire types for the caller's OWN account — the editable display profile and
 * the personal API keys — plus the command vocabulary `dispatch` routes them
 * by. Both surfaces are user-scoped (keyed by the session's subject), so
 * nothing here names an agent or a workspace.
 */

/** The write vocabulary — the same constants back the facade and `dispatch`. */
export const AccountCommand = {
  GetProfile: "account/getProfile",
  SetProfile: "account/setProfile",
  ListKeys: "account/listKeys",
  CreateKey: "account/createKey",
  RevokeKey: "account/revokeKey",
} as const;

export type AccountCommandType =
  (typeof AccountCommand)[keyof typeof AccountCommand];

/**
 * Which fields of {@link EditableProfile} the user has overridden by hand. The
 * gateway resolves each field independently: `true` means the value below is
 * the user's own, `false` means it fell through to the identity provider's
 * (Google's) value. This is what drives the "Remove picture" / "Reset name"
 * affordances — there is nothing to remove when the value is Google's to begin
 * with.
 */
export interface EditableProfileCustom {
  displayName: boolean;
  photoUrl: boolean;
}

/**
 * The caller's own display profile, from `GET /v1/me/profile`. Both fields are
 * the EFFECTIVE values the rest of the product renders: the user's override
 * when {@link EditableProfileCustom} says so, otherwise the identity provider's
 * value. Either can be absent — a user with no Google picture and no upload
 * resolves to a bare `{ custom: … }`, so a consumer falls back to initials
 * rather than render an empty face.
 */
export interface EditableProfile {
  displayName?: string;
  photoUrl?: string;
  custom: EditableProfileCustom;
}

/**
 * Body of `PUT /v1/me/profile`. The three states of each key are distinct and
 * load-bearing: a string SETS the override, `null` CLEARS it back to the
 * identity provider's (Google's) value, and an OMITTED key leaves that field
 * untouched. So a form that only edits the name must send only `displayName` —
 * sending `photoUrl: null` alongside it would silently wipe the picture. The
 * host validates (name 1..60 chars after trimming; photo an `https://` URL or a
 * small `data:image/*;base64,` URI) and answers 400 on a violation.
 */
export interface EditableProfileUpdate {
  displayName?: string | null;
  photoUrl?: string | null;
}

/** One of the caller's active API keys (C9 §Credential). Never the secret. */
export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  /** ISO-8601 creation instant. */
  createdAt: string;
  /** ISO-8601 instant the key last authenticated a request; absent if never used. */
  lastUsedAt?: string;
}

/**
 * The mint response of `POST /v1/keys` (C9): a fresh key plus its FULL secret.
 * `key` (`hst_` + 64 hex) appears ONLY in this response and can never be
 * retrieved again, so the UI holds it in local state for the one-time reveal and
 * MUST keep it out of any query cache.
 */
export interface ApiKeyCreated extends ApiKey {
  key: string;
}

/**
 * The profile update off an untrusted command payload.
 *
 * An ABSENT key and a `null` one mean different things to the host (leave the
 * field alone vs clear the override), so only keys the payload actually
 * carries are copied — never defaulted to `null`.
 */
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
