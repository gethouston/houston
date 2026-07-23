import type {
  AttachmentInvocation,
  AttachmentReference,
} from "@houston-ai/chat";

const MARKER_PREFIX = "<!--houston:attachments ";
const MARKER_SUFFIX = "-->";

export function withAttachmentPaths(text: string, paths: string[]): string {
  if (paths.length === 0) return text;
  const list = groupedAttachmentLines(paths).join("\n");
  const block = `[User attached these files. Read them with the Read tool if needed:\n${list}]`;
  return text.length > 0 ? `${text}\n\n${block}` : block;
}

/**
 * Flat uploads land directly under `uploads/`, so any deeper RELATIVE
 * `uploads/…` path is a folder upload (HOU-808). Listing a 200-file folder
 * file-by-file would bloat the prompt, so each uploaded folder collapses to
 * ONE line naming its root and file count — the agent's file tools list the
 * contents on demand. Order follows first appearance. Anything else (legacy
 * absolute paths included) stays a plain per-file line.
 */
function groupedAttachmentLines(paths: readonly string[]): string[] {
  const lines: string[] = [];
  const folders = new Map<string, { line: number; count: number }>();
  for (const path of paths) {
    const segments = path.split("/");
    if (segments[0] !== "uploads" || segments.length <= 2) {
      lines.push(`- ${path}`);
      continue;
    }
    const root = `${segments[0]}/${segments[1]}`;
    const folder = folders.get(root);
    if (folder) {
      folder.count += 1;
      continue;
    }
    folders.set(root, { line: lines.length, count: 1 });
    lines.push(""); // placeholder, filled below once the count is final
  }
  for (const [root, { line, count }] of folders) {
    lines[line] =
      `- ${root}/ (uploaded folder with ${count} ${count === 1 ? "file" : "files"} inside)`;
  }
  return lines;
}

export function buildAttachmentPrompt(
  text: string,
  files: readonly File[],
  paths: readonly string[],
): string {
  const prompt = withAttachmentPaths(text, [...paths]);
  const attachments = attachmentReferences(files, paths);
  if (attachments.length === 0) return prompt;
  return encodeAttachmentMessage(text, attachments, prompt);
}

export function attachmentReferences(
  files: readonly File[],
  paths: readonly string[],
): AttachmentReference[] {
  return paths.map((path, index) => ({
    path,
    name: files[index]?.name ?? fileNameFromPath(path),
  }));
}

function encodeAttachmentMessage(
  userText: string,
  files: readonly AttachmentReference[],
  claudePrompt: string,
): string {
  const payload: AttachmentInvocation = {
    message: userText.trim(),
    files: [...files],
  };
  const json = JSON.stringify(payload);
  return `${MARKER_PREFIX}${json}${MARKER_SUFFIX}\n\n${claudePrompt}`;
}

function fileNameFromPath(path: string): string {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  return parts.at(-1) ?? path;
}
