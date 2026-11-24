export type Lang = "ts" | "rust" | "css" | "shell";

export type CommentKind = "line" | "block" | "jsx";

export type CommentRole = "tooling" | "why" | "doc" | "prose";

export interface RawComment {
  start: number;
  end: number;
  kind: CommentKind;
  attached?: boolean;
}

export interface Comment extends RawComment {
  id: string;
  file: string;
  line: number;
  col: number;
  endLine: number;
  text: string;
  role: CommentRole;
}

export interface Token {
  text: string;
  pos: number;
}

export interface Pinned {
  path: string;
  startsWith: string;
  reason: string;
}

export interface Excluded {
  path: string;
  reason: string;
}

export interface Config {
  excludedDirNames: string[];
  excluded: Excluded[];
  pinned: Pinned[];
  retiredPaths: Excluded[];
}
