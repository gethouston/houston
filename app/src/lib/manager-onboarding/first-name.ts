export function firstNameOf(
  displayName: string | null | undefined,
): string | null {
  const first = displayName?.trim().split(/\s+/u)[0] ?? "";
  if (first === "" || first.includes("@")) return null;
  return first;
}
