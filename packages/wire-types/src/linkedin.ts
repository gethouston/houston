import { z } from "zod";
import type { SlackConnectReturn } from "./channels-connect-return";

/**
 * Posting to the person's own LinkedIn (`/v1/linkedin/*`, gateway only, on
 * when the deployment holds a LinkedIn app key: `Capabilities.linkedinShare`).
 *
 *  - `POST /v1/linkedin/connect` takes the Slack connect's body
 *    (`{return?, port?, state?}`, {@link LinkedInConnectReturn}; `{}` for the
 *    web app) and answers `{authorizeUrl}`: LinkedIn's own authorization page,
 *    which the person's browser opens. LinkedIn's approval proves only that
 *    SOMEONE approved, so the callback binds nothing: it sends the browser
 *    back with a one-time ticket (web `?settings=linkedin&linkedin=<ticket>`,
 *    desktop loopback `/linkedin?state=<state>&linkedin=<ticket>` or
 *    `houston://settings/linkedin?linkedin=<ticket>`).
 *  - `POST /v1/linkedin/connect/complete` `{ticket}` redeems it for the
 *    signed-in person and answers {@link LinkedInConnection}; an unknown,
 *    expired, spent or foreign ticket is a 404. Reading the connection never
 *    completes one.
 *  - `GET /v1/linkedin/connection` answers {@link LinkedInConnection}.
 *  - `DELETE /v1/linkedin/connection` answers 204.
 *  - `POST /v1/linkedin/posts` takes multipart `image` (PNG or JPEG, at most
 *    {@link LINKEDIN_IMAGE_MAX_BYTES}, height/width at most 1.25 and
 *    width/height at most 3), `text` (1 to {@link LINKEDIN_TEXT_MAX}
 *    characters once trimmed and escaped, {@link linkedInCommentaryLength})
 *    and an optional `altText` (at most
 *    {@link LINKEDIN_ALT_TEXT_MAX}), and answers 201 {@link LinkedInPosted}.
 *
 * A refusal body is `{"code": "<code>", "error": "<message>"}`; the plain
 * `{"error": "<code>"}` shape reads the same.
 */

/** Where the callback sends the browser: the Slack connect's own targets. */
export type LinkedInConnectReturn = SlackConnectReturn;

/** The ticket shape the gateway mints, the same as Slack's. */
export const LINKEDIN_TICKET = /^[A-Za-z0-9._~-]{8,256}$/;

/** A completion ticket, guarded before it becomes a request. */
export function linkedInTicket(value: unknown): string {
  if (typeof value !== "string" || !LINKEDIN_TICKET.test(value))
    throw new Error("Invalid LinkedIn completion ticket");
  return value;
}

export const LINKEDIN_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const LINKEDIN_TEXT_MAX = 3000;
export const LINKEDIN_ALT_TEXT_MAX = 4086;

/**
 * LinkedIn's "little text" reserved characters. The gateway backslash-escapes
 * each one so the words post exactly as written, and counts the commentary
 * after escaping, so every one of them costs two of the 3000 characters.
 */
export const LINKEDIN_RESERVED_CHARS = "\\|{}@[]()<>#*_~";

/**
 * The commentary's length as the gateway counts it: code points (not UTF-16
 * units) once every reserved character carries its backslash.
 */
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
    /** The member's name on LinkedIn, as the dialog says who posts. */
    name: z.string(),
    expiresAt: z.string().refine((v) => Number.isFinite(Date.parse(v))),
  }),
  z.object({ connected: z.literal(false) }),
]);
export type LinkedInConnection = z.infer<typeof linkedInConnectionSchema>;

/** Only LinkedIn's own HTTPS authorization page may leave the app. */
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

/**
 * Why a post did not happen.
 *
 *  - `not_configured`: the deployment holds no LinkedIn key (503), or does
 *    not serve the route at all (404, 405, 501).
 *  - `linkedin_not_connected` (409): no connection, an expired one, or one
 *    LinkedIn no longer honors (the gateway dropped it).
 *  - `invalid_text`, `invalid_image`, `no_image`, `invalid_aspect_ratio`
 *    (400), `image_too_large` (413), `unsupported_media_type` (415): the
 *    gateway refused what the client sent.
 *  - `rate_limited` (429): ours or LinkedIn's; `Retry-After` rides beside it.
 *  - `linkedin_failed` (502): LinkedIn failed the upload or the post.
 *  - `signed_out` (401): the Houston session lapsed.
 *  - `offline`: no answer reached the device.
 */
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

/** The refusal's `code`, from either gateway envelope, off the raw body. */
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

/**
 * The refusal an HTTP status (and its body's code) means, or null for an
 * answer that is a failure rather than a refusal (a 500, a 400 naming nothing
 * this client knows, a 502 or 503 from something other than the route).
 */
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
