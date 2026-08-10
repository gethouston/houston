export function isDirty(current: string, baseline: string): boolean {
  return current !== baseline;
}

export function shouldReseed({
  focused,
  dirty,
}: {
  focused: boolean;
  dirty: boolean;
}): boolean {
  return !focused && !dirty;
}
