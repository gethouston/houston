import { resolve, sep } from "node:path";

/**
 * Resolve a caller-supplied relative path strictly INSIDE `root`. Rejects
 * absolute paths and any `..` traversal — the only writable surface a run may
 * touch is its own workdir.
 */
export function safeJoin(root: string, rel: string): string {
  const abs = resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + sep)) {
    throw new Error(`path escapes the sandbox workspace: ${rel}`);
  }
  return abs;
}
