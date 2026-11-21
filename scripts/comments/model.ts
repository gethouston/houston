export type Lang = "ts" | "rust" | "css" | "shell";

export type CommentKind = "line" | "block" | "jsx";

export interface RawComment {
  start: number;
  end: number;
  kind: CommentKind;
}

export interface Comment extends RawComment {
  id: string;
  file: string;
  line: number;
  col: number;
  endLine: number;
  text: string;
  tooling: boolean;
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
}
