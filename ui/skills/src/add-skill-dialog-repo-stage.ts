import type { RepoSkill } from "./types";

export type RepoStage =
  | { kind: "input" }
  | { kind: "loading"; source: string }
  | { kind: "selection"; source: string; skills: RepoSkill[] }
  | {
      kind: "installing";
      source: string;
      skills: RepoSkill[];
      selected: Set<string>;
    }
  | { kind: "done"; installed: string[] };
