import { creatorSchema } from "@houston/agentstore-contract";

const urlSchema = creatorSchema.shape.url;

const HAS_SCHEME = /^[a-z][a-z\d+.-]*:\/\//i;

export type CreatorUrlResult =
  | { ok: true; url: string | undefined }
  | { ok: false; error: string };

export function normalizeCreatorUrl(raw: string): CreatorUrlResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, url: undefined };

  const candidate = HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;
  const result = urlSchema.safeParse(candidate);
  if (!result.success) {
    return { ok: false, error: "Enter a valid link that starts with https://" };
  }
  return { ok: true, url: result.data };
}
