import type {
  EditableProfile,
  EditableProfileUpdate,
} from "@houston/engine-adapter";

export function patchEditableProfile(
  profile: EditableProfile | null | undefined,
  update: EditableProfileUpdate,
): EditableProfile | null | undefined {
  if (!profile) return profile;
  let next = profile;
  for (const field of ["displayName", "photoUrl"] as const) {
    const value = update[field];
    if (value === undefined) continue;
    const custom = value !== null;
    const target = value ?? undefined;
    if (next[field] === target && next.custom[field] === custom) continue;
    const { [field]: _dropped, ...rest } = next;
    next = {
      ...rest,
      ...(target === undefined ? {} : { [field]: target }),
      custom: { ...next.custom, [field]: custom },
    };
  }
  return next;
}
