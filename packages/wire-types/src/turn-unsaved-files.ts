import {
  MAX_UNSAVED_FILES,
  MAX_UNSAVED_PATH,
  UNSAVED_FILE_REASONS,
  type UnsavedFile,
  type UnsavedFilesReport,
} from "@houston/protocol";
import { z } from "zod";

export {
  MAX_UNSAVED_FILES,
  MAX_UNSAVED_PATH,
  UNSAVED_FILE_REASONS,
  type UnsavedFile,
  type UnsavedFileReason,
  type UnsavedFilesReport,
} from "@houston/protocol";

const path = z.string().min(1).max(MAX_UNSAVED_PATH);
const count = z.number().int().nonnegative();
const reason = z.enum(UNSAVED_FILE_REASONS);

const fileSchema = z.object({
  path,
  reason,
  copyPath: path.optional(),
  internal: z.literal(true).optional(),
});

const reportSchema = z.object({
  files: z.array(z.unknown()),
  total: count,
  counts: z.record(z.string(), z.unknown()).optional(),
});

export function parseUnsavedFiles(data: unknown): UnsavedFilesReport | null {
  if (typeof data !== "object" || data === null) return null;
  const report = reportSchema.safeParse(
    (data as { unsavedFiles?: unknown }).unsavedFiles,
  );
  if (!report.success) return null;
  const files: UnsavedFile[] = [];
  for (const entry of report.data.files.slice(0, MAX_UNSAVED_FILES)) {
    const file = fileSchema.safeParse(entry);
    if (file.success) files.push(file.data as UnsavedFile);
  }
  const counts: UnsavedFilesReport["counts"] = {};
  for (const [key, value] of Object.entries(report.data.counts ?? {})) {
    const known = reason.safeParse(key);
    const n = count.safeParse(value);
    if (known.success && n.success) counts[known.data] = n.data;
  }
  const total = Math.max(report.data.total, files.length);
  if (total === 0) return null;
  return { files, total, counts };
}

export function userVisibleUnsavedFiles(
  report: UnsavedFilesReport | null | undefined,
): UnsavedFile[] {
  return (report?.files ?? []).filter(
    (file) => !file.internal && !file.path.startsWith(".houston/"),
  );
}
