import type { Comment } from "../model.ts";
import { scanSource } from "../scan.ts";

export function scan(file: string, lines: readonly string[]): Comment[] {
  return scanSource(file, lines.join("\n"), []);
}

export function texts(file: string, lines: readonly string[]): string[] {
  return scan(file, lines).map((comment) => comment.text);
}

export function prose(file: string, lines: readonly string[]): string[] {
  return scan(file, lines)
    .filter((comment) => !comment.tooling)
    .map((comment) => comment.text);
}
