import { resolve, sep } from "node:path";

export function safeJoin(root: string, rel: string): string {
  const abs = resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + sep)) {
    throw new Error(`path escapes the sandbox workspace: ${rel}`);
  }
  return abs;
}
