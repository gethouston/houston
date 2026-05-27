/**
 * Classify a File into a coarse `file_kind` bucket for the
 * `file_attached` analytics event. Keep small and predictable —
 * the goal is to surface the long-tail of "what file types are
 * users attaching" without leaking actual file names or paths.
 */
export function classifyFileKind(file: File): string {
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf") return "pdf";
  const name = file.name.toLowerCase();
  if (/\.(md|markdown|txt|rst)$/.test(name)) return "text";
  if (/\.(csv|xlsx?|tsv)$/.test(name)) return "spreadsheet";
  if (/\.(docx?|odt)$/.test(name)) return "document";
  return "other";
}
