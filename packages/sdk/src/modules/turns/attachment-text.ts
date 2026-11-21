const MARKER_PREFIX = "<!--houston:attachments ";
const MARKER_SUFFIX = "-->";
const MARKER_RE = /^<!--houston:attachments (\{[\s\S]*?\})-->\s*\n?\n?/;

export interface AttachmentRef {
  path: string;
  name: string;
}

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
