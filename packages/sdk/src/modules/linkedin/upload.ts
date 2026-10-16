import {
  LINKEDIN_ALT_TEXT_MAX,
  LINKEDIN_IMAGE_MAX_BYTES,
  LINKEDIN_TEXT_MAX,
  linkedInCommentaryLength,
} from "@houston/wire-types";
import type { LinkedInPostInput, LinkedInPostResult } from "./types";

type Refused = Extract<LinkedInPostResult, { kind: "refused" }>;

const IMAGE_NAMES: Record<string, string> = {
  "image/png": "org-chart.png",
  "image/jpeg": "org-chart.jpg",
};

/**
 * Control characters the gateway refuses in a post (all but line breaks and
 * tabs): a paste can carry them unseen, so they are dropped, never refused.
 */
function isRefusedControl(char: string): boolean {
  const code = char.charCodeAt(0);
  if (char === "\n" || char === "\r" || char === "\t") return false;
  return code < 0x20 || (code >= 0x7f && code <= 0x9f);
}

/** The words as they are sent: control characters dropped, trimmed. */
export function linkedInPostText(text: string): string {
  return [...text]
    .filter((char) => !isRefusedControl(char))
    .join("")
    .trim();
}

/**
 * Whether the gateway takes the post's words: `empty` once trimmed, or
 * `tooLong` by `over` characters as the gateway counts them (after escaping
 * LinkedIn's reserved characters, `linkedInCommentaryLength`), so a post full
 * of `#`, `@` or `_` is refused here rather than by the gateway.
 */
export type LinkedInTextCheck =
  | { kind: "ok" }
  | { kind: "empty" }
  | { kind: "tooLong"; over: number };

export function checkLinkedInText(text: string): LinkedInTextCheck {
  const sent = linkedInPostText(text);
  if (sent.length === 0) return { kind: "empty" };
  const over = linkedInCommentaryLength(sent) - LINKEDIN_TEXT_MAX;
  return over > 0 ? { kind: "tooLong", over } : { kind: "ok" };
}

/** Whether the post's words are something the gateway takes. */
export function isPostableLinkedInText(text: string): boolean {
  return checkLinkedInText(text).kind === "ok";
}

/**
 * The multipart `postImage` sends (`image`, `text`, then `altText` when there
 * is one), or the refusal it earns before any request: words the gateway
 * would refuse, a picture over its cap or of a type it does not take. The
 * words go as `linkedInPostText` leaves them; an alt text past its cap is cut
 * rather than refused, since the person never wrote it.
 */
export function linkedInUpload(input: LinkedInPostInput): FormData | Refused {
  const { image, altText } = input;
  if (!isPostableLinkedInText(input.text))
    return { kind: "refused", code: "invalid_text" };
  const name = IMAGE_NAMES[image.type];
  if (!name) return { kind: "refused", code: "unsupported_media_type" };
  if (image.size > LINKEDIN_IMAGE_MAX_BYTES)
    return { kind: "refused", code: "image_too_large" };
  const upload = new FormData();
  upload.append("image", image, name);
  upload.append("text", linkedInPostText(input.text));
  const alt = altText && linkedInPostText(altText);
  if (alt)
    upload.append("altText", [...alt].slice(0, LINKEDIN_ALT_TEXT_MAX).join(""));
  return upload;
}
