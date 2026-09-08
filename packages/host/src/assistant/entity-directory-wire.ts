/** Parse only identity fields; malformed directories must fail, never look empty. */
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("entity directory returned an invalid record");
  return value as Record<string, unknown>;
}

export function textField(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || !value.trim())
    throw new Error(`entity directory returned an invalid ${key}`);
  return value;
}

export function optionalText(
  row: Record<string, unknown>,
  key: string,
): string | undefined {
  return row[key] === undefined || row[key] === null
    ? undefined
    : textField(row, key);
}

export const namedEntity = (row: Record<string, unknown>) => ({
  id: textField(row, "id"),
  name: textField(row, "name"),
});

export const skillEntity = (row: Record<string, unknown>) => ({
  slug: textField(row, "name"),
  name: optionalText(row, "title") ?? textField(row, "name"),
});

export const gatewayAgent = (row: Record<string, unknown>) => ({
  ...namedEntity(row),
  workspaceId: optionalText(row, "workspaceId"),
});

export const memberEntity = (row: Record<string, unknown>) => {
  const userId = textField(row, "userId");
  const email = optionalText(row, "email");
  return {
    userId,
    name: optionalText(row, "displayName") ?? email ?? userId,
    ...(email ? { email } : {}),
  };
};

export const inviteEntity = (row: Record<string, unknown>) => ({
  id: textField(row, "id"),
  email: textField(row, "email"),
});

export const activityEntity = (row: Record<string, unknown>) => ({
  id: textField(row, "id"),
  name: textField(row, "title"),
});
