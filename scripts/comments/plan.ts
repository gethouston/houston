import { deleteComments } from "./delete.ts";
import type { Pinned } from "./model.ts";
import { requireLang, scanSource } from "./scan.ts";
import { compareTokens, describeMismatch } from "./verify.ts";

export interface PlanInput {
  inScope: (file: string) => boolean;
  read: (file: string) => string;
  pinned: readonly Pinned[];
}

export interface Edit {
  file: string;
  after: string;
  count: number;
}

export interface Plan {
  edits: Edit[];
  errors: string[];
  refused: string[];
}

function idsByFile(
  decisions: unknown,
  errors: string[],
): Map<string, Set<string>> {
  const byFile = new Map<string, Set<string>>();
  if (!Array.isArray(decisions)) {
    errors.push("the decisions file must hold a JSON array of { id, action }");
    return byFile;
  }
  for (const decision of decisions as unknown[]) {
    const fields: Record<string, unknown> =
      typeof decision === "object" && decision !== null ? { ...decision } : {};
    const id = fields.id;
    const match = typeof id === "string" ? /^(.+):\d+:\d+$/.exec(id) : null;
    if (!match || typeof id !== "string" || fields.action !== "delete") {
      errors.push(
        `${JSON.stringify(decision)} is not { "id": "<file>:<line>:<col>", "action": "delete" }`,
      );
      continue;
    }
    const ids = byFile.get(match[1]) ?? new Set<string>();
    ids.add(id);
    byFile.set(match[1], ids);
  }
  return byFile;
}

export function planDeletions(decisions: unknown, input: PlanInput): Plan {
  const plan: Plan = { edits: [], errors: [], refused: [] };
  for (const [file, ids] of idsByFile(decisions, plan.errors)) {
    if (!input.inScope(file)) {
      plan.errors.push(`${file} is not a file the comment tools read`);
      continue;
    }
    const before = input.read(file);
    const comments = new Map(
      scanSource(file, before, input.pinned).map((c) => [c.id, c]),
    );
    const targets = [...ids].flatMap((id) => {
      const comment = comments.get(id);
      if (!comment)
        plan.errors.push(
          `${id}: no comment starts here; run pnpm comments:list again`,
        );
      else if (comment.role !== "prose")
        plan.errors.push(
          `${id} is a ${comment.role} comment and is never deleted`,
        );
      else return [comment];
      return [];
    });
    if (targets.length === 0) continue;
    const after = deleteComments(before, targets, requireLang(file));
    try {
      const mismatch = compareTokens(file, before, after);
      if (mismatch)
        plan.refused.push(
          `skipped, edit by hand: ${describeMismatch(file, mismatch)}`,
        );
      else plan.edits.push({ file, after, count: targets.length });
    } catch (error) {
      plan.refused.push(
        `skipped, edit by hand: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return plan;
}
