const MARKER_RE = /^<!--houston:attachments (\{[\s\S]*?\})-->\s*\n?\n?/;

export interface AttachmentReference {
  name: string;
  path: string;
}

export interface AttachmentInvocation {
  message: string;
  files: AttachmentReference[];
}

export function normalizeAttachmentReferences(
  value: unknown,
): AttachmentReference[] {
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
    return [{ name, path }];
  });
}

export function decodeAttachmentMessage(
  body: string,
): AttachmentInvocation | null {
  const match = body.match(MARKER_RE);
  if (!match) return null;
  try {
    const payload = JSON.parse(match[1]) as Record<string, unknown>;
    const files = normalizeAttachmentReferences(payload.files);
    if (files.length === 0) return null;
    return {
      message: typeof payload.message === "string" ? payload.message : "",
      files,
    };
  } catch {
    return null;
  }
}

function fileNameFromPath(path: string): string {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  return parts.at(-1) ?? path;
}
