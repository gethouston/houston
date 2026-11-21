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
    lines.push("");
  }
  for (const [root, { line, count }] of folders) {
    lines[line] =
      `- ${root}/ (uploaded folder with ${count} ${count === 1 ? "file" : "files"} inside)`;
  }
  return lines;
}

export function joinModelContext(
  ...parts: (string | undefined)[]
): string | undefined {
  const present = parts.filter(
    (part): part is string => part !== undefined && part !== "",
  );
  return present.length > 0 ? present.join("\n\n") : undefined;
}

export function buildAttachmentPrompt(
  text: string,
  files: readonly File[],
  paths: readonly string[],
  modelContext?: string,
): string {
  const base = modelContext ? `${modelContext}\n\n${text}` : text;
  const prompt = withAttachmentPaths(base, [...paths]);
  const attachments = attachmentReferences(files, paths);
  if (attachments.length === 0) return prompt;
  return encodeAttachmentMessage(text, attachments, prompt);
}

export interface AttachmentSend {
  prompt: string;
  queuedPreview: { text: string; attachmentNames: string[] };
}

export async function prepareAttachmentSend(
  text: string,
  files: readonly File[],
  save: (files: File[]) => Promise<string[]>,
  modelContext?: string,
): Promise<AttachmentSend> {
  const paths = await save([...files]);
  return {
    prompt: buildAttachmentPrompt(text, files, paths, modelContext),
    queuedPreview: { text, attachmentNames: files.map((f) => f.name) },
  };
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
  const json = JSON.stringify(payload).replace(/>/g, "\\u003e");
  return `${MARKER_PREFIX}${json}${MARKER_SUFFIX}\n\n${claudePrompt}`;
}

function fileNameFromPath(path: string): string {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  return parts.at(-1) ?? path;
}
