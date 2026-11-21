import { z } from "zod";
import type { SlackConnectReturn } from "./channels-connect-return";

export type LinkedInConnectReturn = SlackConnectReturn;

export const LINKEDIN_TICKET = /^[A-Za-z0-9._~-]{8,256}$/;

export function linkedInTicket(value: unknown): string {
  if (typeof value !== "string" || !LINKEDIN_TICKET.test(value))
    throw new Error("Invalid LinkedIn completion ticket");
  return value;
}

export const LINKEDIN_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const LINKEDIN_TEXT_MAX = 3000;
export const LINKEDIN_ALT_TEXT_MAX = 4086;

export const LINKEDIN_RESERVED_CHARS = "\\|{}@[]()<>#*_~";

export function linkedInCommentaryLength(text: string): number {
  let length = 0;
  for (const char of text)
    length += LINKEDIN_RESERVED_CHARS.includes(char) ? 2 : 1;
  return length;
}

const AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
const POST_URL = /^https:\/\/www\.linkedin\.com\/feed\/update\/[^/?#]+\/?$/;

export const linkedInConnectionSchema = z.union([
  z.object({
    connected: z.literal(true),
    name: z.string(),
    expiresAt: z.string().refine((v) => Number.isFinite(Date.parse(v))),
  }),
  z.object({ connected: z.literal(false) }),
]);
export type LinkedInConnection = z.infer<typeof linkedInConnectionSchema>;

export const linkedInConnectSchema = z.object({
  authorizeUrl: z.string().refine((value) => {
    try {
      const url = new URL(value);
      return (
        `${url.origin}${url.pathname}` === AUTHORIZE_URL &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }),
});

export const linkedInPostedSchema = z.object({
  postUrn: z.string().startsWith("urn:li:"),
  postUrl: z.string().regex(POST_URL),
});
export type LinkedInPosted = z.infer<typeof linkedInPostedSchema>;

export const LINKEDIN_REFUSALS = [
  "not_configured",
  "linkedin_not_connected",
  "invalid_text",
  "invalid_image",
  "no_image",
  "invalid_aspect_ratio",
  "image_too_large",
  "unsupported_media_type",
  "rate_limited",
  "linkedin_failed",
  "signed_out",
  "offline",
] as const;
export type LinkedInRefusalCode = (typeof LINKEDIN_REFUSALS)[number];

const BAD_REQUEST = new Set<string>([
  "invalid_text",
  "invalid_image",
  "no_image",
  "invalid_aspect_ratio",
]);

export function linkedInBodyCode(body: string): string | null {
  try {
    const value: unknown = JSON.parse(body);
    if (typeof value !== "object" || value === null) return null;
    const { code, error } = value as { code?: unknown; error?: unknown };
    if (typeof code === "string") return code;
    return typeof error === "string" ? error : null;
  } catch {
    return null;
  }
}

export function linkedInRefusalOf(
  status: number,
  body = "",
): LinkedInRefusalCode | null {
  const code = linkedInBodyCode(body);
  switch (status) {
    case 400:
      return code && BAD_REQUEST.has(code)
        ? (code as LinkedInRefusalCode)
        : null;
    case 401:
      return "signed_out";
    case 404:
    case 405:
    case 501:
      return "not_configured";
    case 409:
      return code === "linkedin_not_connected" ? code : null;
    case 413:
      return "image_too_large";
    case 415:
      return "unsupported_media_type";
    case 429:
      return "rate_limited";
    case 502:
      return code === "linkedin_failed" ? code : null;
    case 503:
      return code === "not_configured" ? code : null;
    default:
      return null;
  }
}
