const ACRONYMS: ReadonlySet<string> = new Set([
  "ai",
  "glm",
  "gpt",
  "llm",
  "moe",
  "oss",
]);

function isoDate(segment: string): string | null {
  const parts = /^(\d{4})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.exec(segment);
  return parts ? `${parts[1]}-${parts[2]}-${parts[3]}` : null;
}

function joinVersionRuns(segments: readonly string[]): string[] {
  const out: string[] = [];
  for (const segment of segments) {
    const previous = out[out.length - 1];
    if (
      /^\d+$/.test(segment) &&
      previous !== undefined &&
      /^\d+(\.\d+)*$/.test(previous)
    ) {
      out[out.length - 1] = `${previous}.${segment}`;
      continue;
    }
    out.push(segment);
  }
  return out;
}

function titleCase(word: string): string {
  if (/^\d/.test(word)) return word.toUpperCase();
  if (ACRONYMS.has(word)) return word.toUpperCase();
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function humanizedModelName(id: string): string {
  if (!id) return "";
  const segments = id
    .slice(id.lastIndexOf("/") + 1)
    .split(/[-_]/)
    .filter(Boolean);
  const last = segments[segments.length - 1];
  const date = last === undefined ? null : isoDate(last);
  const name = joinVersionRuns(date ? segments.slice(0, -1) : segments)
    .map(titleCase)
    .join(" ");
  if (!name) return id;
  return date ? `${name} (${date})` : name;
}
