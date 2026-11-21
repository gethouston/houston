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
