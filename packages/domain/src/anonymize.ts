import type {
  AnonymizedItem,
  AnonymizedRoutine,
  AnonymizedText,
  PortableAnonymizeResponse,
  RoutineFieldDiff,
  RoutineFieldOverride,
} from "@houston/protocol";
import type { PortableContent } from "./portable";

/**
 * Heuristic anonymizer for portable agent payloads — the TS port of the
 * Rust engine's `portable/anonymize.rs`, behavior-preserving.
 *
 * V1 uses regex patterns: emails, phone numbers, absolute paths that leak
 * `/Users/<name>` / `/home/<name>`, handles, URLs. An LLM-driven version
 * (better, slower, costs tokens) is the intended v2 upgrade — when it
 * lands, swap the implementation behind this same API and the wizard does
 * not change.
 *
 * Pure: the caller (host route) gathers the selected content off the vfs.
 */

// ── Patterns ─────────────────────────────────────────────────────────────
// Order matters in redactText: paths before emails so usernames embedded in
// `/Users/julian/...` get caught by the path rule, not stripped to
// `<email>` accidentally.

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
// `+1 555-555-1212`, `(555) 555-1212`, `+57 311 234 5678`. Conservative:
// requires 9+ digits including separators.
const PHONE = /\+?\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}/g;
// `@alice` outside of an email context (emails are redacted first).
const HANDLE = /(^|[\s,.;:!])@[a-zA-Z][a-zA-Z0-9._-]{2,}/g;
const URL_RE = /https?:\/\/[^\s<>)\]]+/g;
const PATH_USERS_MAC = /(\/Users\/)[A-Za-z0-9._-]+/g;
const PATH_USERS_LINUX = /(\/home\/)[A-Za-z0-9._-]+/g;
const PATH_USERS_WIN = /([Cc]:\\Users\\)[A-Za-z0-9._-]+/g;
// Remaining absolute paths in other root dirs (`/var/log/...`, `/etc/...`).
// `Users/` and `home/` are intentionally NOT here — the per-OS rules above
// keep the `<user>` token instead of collapsing to `<path>`.
const ABSOLUTE_PATH = /(^|\s)\/(?:var|opt|etc|tmp)\/\S+/g;
/** Placeholder tokens the redactor emits, e.g. `<email>`. */
const PLACEHOLDER = /<[a-zA-Z_-]+>/g;

/** Apply every redaction pattern in turn. */
export function redactText(body: string): string {
  let out = body;
  out = out.replace(PATH_USERS_MAC, "$1<user>");
  out = out.replace(PATH_USERS_LINUX, "$1<user>");
  out = out.replace(PATH_USERS_WIN, "$1<user>");
  out = out.replace(ABSOLUTE_PATH, "$1<path>");
  out = out.replace(EMAIL, "<email>");
  out = out.replace(PHONE, "<phone>");
  out = out.replace(HANDLE, "$1<handle>");
  out = out.replace(URL_RE, "<url>");
  return out;
}

function countMatches(re: RegExp, s: string): number {
  return (s.match(re) ?? []).length;
}

function summarize(before: string, after: string): string {
  const kinds: [string, number][] = [
    ["email", countMatches(EMAIL, before)],
    [
      "path",
      countMatches(PATH_USERS_MAC, before) +
        countMatches(PATH_USERS_LINUX, before) +
        countMatches(PATH_USERS_WIN, before) +
        countMatches(ABSOLUTE_PATH, before),
    ],
    ["phone", countMatches(PHONE, before)],
    ["handle", countMatches(HANDLE, before)],
    ["url", countMatches(URL_RE, before)],
  ];
  const parts = kinds.filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`);
  if (parts.length === 0) return "no obvious personal info detected";
  if (before === after) return `matched but unchanged (${parts.join(", ")})`;
  return `redacted ${parts.join(", ")}`;
}

/** Redact one text and describe the change for the side-by-side diff. */
export function redactString(body: string): AnonymizedText {
  const after = redactText(body);
  // "Became empty" = nothing meaningful left once the placeholder tokens
  // are stripped. The UI uses this to nudge "exclude this item instead?" —
  // a placeholder-only learning is worse than no learning.
  const stripped = after.replace(PLACEHOLDER, "");
  const becameEmpty = !/[\p{L}\p{N}]/u.test(stripped);
  return { before: body, after, summary: summarize(body, after), becameEmpty };
}

/**
 * Anonymize the given content (already filtered to the user's selection)
 * and return the diffs the wizard renders side-by-side. A routine entry is
 * always present for each input routine; `fieldDiffs` is empty when nothing
 * in it needed redaction (the wizard skips those cards).
 */
export function anonymizeContent(
  content: PortableContent,
): PortableAnonymizeResponse {
  const skills: AnonymizedItem[] = content.skills.map((s) => ({
    id: s.slug,
    ...redactString(s.body),
  }));

  const routines: AnonymizedRoutine[] = content.routines.map((routine) => {
    const fieldDiffs: RoutineFieldDiff[] = [];
    const overridePayload: RoutineFieldOverride = {};
    const fields = [
      ["name", routine.name],
      ["prompt", routine.prompt],
    ] as const;
    for (const [field, original] of fields) {
      const after = redactText(original);
      if (after !== original) {
        fieldDiffs.push({ field, before: original, after });
        overridePayload[field] = after;
      }
    }
    return { id: routine.id, fieldDiffs, overridePayload };
  });

  return {
    claudeMd:
      content.claudeMd !== undefined ? redactString(content.claudeMd) : null,
    skills,
    routines,
    learnings: content.learnings.map((l) => ({
      id: l.id,
      ...redactString(l.text),
    })),
  };
}
