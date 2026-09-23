/**
 * Which paths in a turn name a file the USER would want to open — the rule
 * behind the chat's file cards and the turn-end summary's "New files" section.
 * Pure, so both surfaces answer identically.
 */

import { fileNameOf } from "./agent-file-paths.ts";

const USER_FILE_EXTENSIONS = new Set([
  "docx",
  "doc",
  "xlsx",
  "xls",
  "pptx",
  "ppt",
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "svg",
  "gif",
  "txt",
  "rtf",
  "csv",
  // Plain-text formats agents routinely write as user-visible output. `md`
  // is the one that prompted this: a real user reported a `perfil.md`
  // from the agent never showed up in the "New files" section because md
  // wasn't on this allowlist (it was rejected on every OS, the Windows
  // separator bugs just made it harder to notice).
  "md",
  "markdown",
  "html",
  "json",
  "yaml",
  "yml",
]);

export function isUserVisibleFilePath(path: string): boolean {
  const fileName = fileNameOf(path);
  const ext = fileName.includes(".")
    ? fileName.split(".").pop()?.toLowerCase()
    : "";
  return Boolean(ext && USER_FILE_EXTENSIONS.has(ext));
}

/**
 * Paths a shell command claims to have produced. A command tool reports no
 * structured file list, so the only evidence a file was written is what the
 * script printed: a labeled line ("Saved: out/report.pdf") or a bare absolute
 * path on a line of its own.
 */
export function extractPathsFromBashOutput(output: string): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const p = raw.trim();
    if (p && !seen.has(p)) {
      seen.add(p);
      paths.push(p);
    }
  };

  const labeled =
    /(?:saved|created|wrote|written|output|file):\s*([^\r\n]+\.[a-zA-Z0-9]{1,10})/gi;
  for (
    let match = labeled.exec(output);
    match !== null;
    match = labeled.exec(output)
  ) {
    add(match[1]);
  }

  const bare = /^(\/[^\r\n]+\.[a-zA-Z0-9]{1,10})\s*$/gm;
  for (
    let match = bare.exec(output);
    match !== null;
    match = bare.exec(output)
  ) {
    add(match[1]);
  }

  return paths;
}
