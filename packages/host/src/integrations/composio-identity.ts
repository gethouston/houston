export interface IdentityProbe {
  action: string;
  params?: Record<string, unknown>;
  fields: string[];
}

export const IDENTITY_PROBES: Record<string, IdentityProbe> = {
  gmail: { action: "GMAIL_GET_PROFILE", fields: ["emailAddress"] },
  outlook: {
    action: "OUTLOOK_GET_PROFILE",
    fields: ["mail", "userPrincipalName"],
  },
};

const MAX_LABEL_LENGTH = 100;

function fieldOf(data: unknown, field: string): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const v = (data as Record<string, unknown>)[field];
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s.length > 0 && s.length <= MAX_LABEL_LENGTH ? s : undefined;
}

export function extractIdentity(
  data: unknown,
  fields: string[],
): string | undefined {
  const wrapped =
    data && typeof data === "object"
      ? (data as Record<string, unknown>).response_data
      : undefined;
  for (const field of fields) {
    const label = fieldOf(data, field) ?? fieldOf(wrapped, field);
    if (label) return label;
  }
  return undefined;
}
