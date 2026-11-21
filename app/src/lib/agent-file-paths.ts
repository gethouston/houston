export interface AgentPathContext {
  folderPath: string;
  localDir?: string;
}

export function toPosixSeparator(path: string): string {
  return path.replace(/\\/g, "/");
}

const PERCENT_ESCAPE = /%[0-9a-fA-F]{2}/;

export function decodeMarkdownHref(href: string): string {
  if (!PERCENT_ESCAPE.test(href)) return href;
  try {
    return decodeURIComponent(href);
  } catch {
    return href;
  }
}

export function fileNameOf(path: string): string {
  const segments = path.split(/[\\/]/);
  return segments[segments.length - 1] || path;
}

export function toWorkspaceRelative(
  rawPath: string,
  agent: AgentPathContext,
): string {
  let path = toPosixSeparator(rawPath.trim());
  while (path.startsWith("./")) path = path.slice(2);

  const roots = [agent.localDir, agent.folderPath]
    .filter((root): root is string => Boolean(root))
    .map((root) => toPosixSeparator(root).replace(/\/+$/, ""));

  for (const root of roots) {
    if (path.startsWith(`${root}/`)) return path.slice(root.length + 1);
    const marker = `/${root}/`;
    const at = path.indexOf(marker);
    if (at !== -1) return path.slice(at + marker.length);
  }
  return path;
}
