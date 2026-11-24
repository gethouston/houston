const MARKER_PREFIX = "<!--houston:attachments ";
const MARKER_SUFFIX = "-->";
const MARKER_RE = /^<!--houston:attachments (\{[\s\S]*?\})-->\s*\n?\n?/;

/**
 * One attached file on the wire: the workspace-relative `path` the agent's Read
 * tool opens, plus the original display `name`. Key order (path, name) is
 * load-bearing — it is what the desktop encoder serializes, and
 * `buildAttachmentText` reproduces those exact bytes.
 */
export interface AttachmentRef {
  path: string;
  name: string;
}

/**
 * The decoded marker shaped for feed rendering: the user's original text and
 * the attachment names. Paths are intentionally dropped from the render (they
 * are model-facing only).
 */
export interface DecodedAttachmentText {
  displayText: string;
  attachments: { name: string }[];
}

function fileNameFromPath(path: string): string {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  return parts.at(-1) ?? path;
}

function withAttachmentPaths(text: string, paths: readonly string[]): string {
  if (paths.length === 0) return text;
  const list = paths.map((p) => `- ${p}`).join("\n");
  const block = `[User attached these files. Read them with the Read tool if needed:\n${list}]`;
  return text.length > 0 ? `${text}\n\n${block}` : block;
}

/**
 * Build the full message text for a turn carrying attachments: a hidden
 * `<!--houston:attachments {json}-->` marker (display metadata for feed
 * rendering) followed by the user's text and the visible path block the model
 * reads. Byte-for-byte identical to the desktop composer's output. With no
 * `paths` it returns `text` unchanged.
 *
 * `names[i]` pairs with `paths[i]`; a missing name falls back to the path's
 * basename (matching the desktop encoder).
 */
export function buildAttachmentText(
  text: string,
  paths: readonly string[],
  names: readonly string[] = [],
): string {
  const prompt = withAttachmentPaths(text, paths);
  if (paths.length === 0) return prompt;
  const files: AttachmentRef[] = paths.map((path, i) => ({
    path,
    name: names[i] ?? fileNameFromPath(path),
  }));
  const json = JSON.stringify({ message: text.trim(), files }).replace(
    />/g,
    "\\u003e",
  );
  return `${MARKER_PREFIX}${json}${MARKER_SUFFIX}\n\n${prompt}`;
}

/**
 * Decode a persisted message's leading attachment marker into the display text
 * and attachment names for feed rendering. Returns `null` when there is no
 * marker, its JSON is malformed, or it carries no files (nothing to render
 * specially). Never throws.
 */
export function decodeAttachmentText(
  text: string,
): DecodedAttachmentText | null {
  const match = text.match(MARKER_RE);
  if (!match) return null;
  try {
    const payload = JSON.parse(match[1]) as Record<string, unknown>;
    const attachments = normalizeNames(payload.files);
    if (attachments.length === 0) return null;
    return {
      displayText: typeof payload.message === "string" ? payload.message : "",
      attachments,
    };
  } catch {
    return null;
  }
}

function normalizeNames(value: unknown): { name: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const path = typeof record.path === "string" ? record.path.trim() : "";
    if (!path) return [];
    const name =
      typeof record.name === "string" && record.name.trim()
        ? record.name.trim()
        : fileNameFromPath(path);
    return [{ name }];
  });
}
