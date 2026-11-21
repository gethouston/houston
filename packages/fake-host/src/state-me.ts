import type { FakeMember, FakeMeProfile } from "./state-store";
import { SELF_USER_ID, state } from "./state-store";

function effective(field: "displayName" | "photoUrl"): string | undefined {
  return state.meProfileCustom[field] ?? state.meProfileBase[field];
}

export function getMyProfile(): FakeMeProfile {
  const displayName = effective("displayName");
  const photoUrl = effective("photoUrl");
  return {
    ...(displayName !== undefined ? { displayName } : {}),
    ...(photoUrl !== undefined ? { photoUrl } : {}),
    custom: {
      displayName: state.meProfileCustom.displayName !== null,
      photoUrl: state.meProfileCustom.photoUrl !== null,
    },
  };
}

function reflectField(
  row: FakeMember,
  field: "displayName" | "photoUrl",
): void {
  const value = effective(field);
  if (value === undefined) delete row[field];
  else row[field] = value;
}

export function setMyProfileFields(patch: {
  displayName?: string | null;
  photoUrl?: string | null;
}): void {
  if ("displayName" in patch)
    state.meProfileCustom.displayName = patch.displayName ?? null;
  if ("photoUrl" in patch)
    state.meProfileCustom.photoUrl = patch.photoUrl ?? null;

  const self = state.orgMembers?.find((m) => m.userId === SELF_USER_ID);
  if (!self) return;
  reflectField(self, "displayName");
  reflectField(self, "photoUrl");
}
