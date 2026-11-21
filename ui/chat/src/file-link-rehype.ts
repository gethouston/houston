import { splitFileLinks } from "./file-link-text.ts";

export const FILE_PATH_ATTR = "data-file-path";

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const PERCENT_ESCAPE = /%[0-9a-fA-F]{2}/;

export function markdownFilePath(href: string): string | null {
  const raw = href.trim();
  if (!raw) return null;
  if (HAS_SCHEME.test(raw)) return null;
  if (raw.startsWith("//")) return null;
  if (raw.startsWith("#") || raw.startsWith("?")) return null;
  return decodePath(raw);
}

function decodePath(path: string): string {
  if (!PERCENT_ESCAPE.test(path)) return path;
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

export function fileLinkProperties(
  destination: string,
): Record<string, unknown> | null {
  const path = markdownFilePath(destination);
  if (path === null) return null;
  const href =
    destination.startsWith("/") || destination.startsWith(".")
      ? destination
      : `./${destination}`;
  return { href, [FILE_PATH_ATTR]: path };
}

const SKIP_TAGS = new Set(["code", "pre", "a"]);

export function fileLinkRehypePlugin() {
  return (tree: unknown) => {
    walk(tree as HastNode, false);
  };
}

function walk(node: HastNode, skip: boolean): void {
  if (node.tagName === "a" && node.properties) {
    const href = node.properties.href;
    if (typeof href === "string") {
      const properties = fileLinkProperties(href);
      if (properties) Object.assign(node.properties, properties);
    }
  }

  const children = node.children;
  if (!children || children.length === 0) return;

  const next: HastNode[] = [];
  let changed = false;
  for (const child of children) {
    if (child.type === "element") {
      walk(child, skip || SKIP_TAGS.has(child.tagName ?? ""));
      next.push(child);
      continue;
    }
    if (skip || child.type !== "text" || typeof child.value !== "string") {
      next.push(child);
      continue;
    }
    const split = splitFileLinks(child.value, fileLinkProperties);
    if (!split) {
      next.push(child);
      continue;
    }
    changed = true;
    next.push(...split);
  }
  if (changed) node.children = next;
}
