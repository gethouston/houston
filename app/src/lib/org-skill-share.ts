// Org skill by default (HOU-1192): a skill an agent creates in a
// create-with-AI chat is promoted into the workspace/org skill store the
// moment the client detects it, and enabled ONLY for the agent that built it
// (one explicit manifest write, per ADR 0003). The other agents are NOT
// installed to — the skill sits in the workspace store where the user can
// enable it per agent from the Skills surfaces. Dependency-injected and
// framework-free so the whole flow is node-testable
// (app/tests/org-skill-share.test.ts); the hook wrapper
// (components/tabs/use-org-skill-default.ts) binds it to the engine client.

/**
 * True when the workspace store DECLINED the promotion for an expected,
 * explainable reason — feature absence or policy, not a Houston bug:
 *
 * - 409: the slug already exists in the store (the agent picked a name a
 *   workspace skill already uses; the local copy stays and shadows it).
 * - 403: this user may not write org skills here (Teams: member role — the
 *   gateway enforces admin-only org-skill writes).
 * - 404: the deployment predates the shared-skills routes entirely (the
 *   HOU-1105 rule: a missing route is feature absence, not a bug). The share
 *   is attempted even while `/v1/capabilities` is still loading — a one-shot
 *   claim must not be dropped on a startup race — so the wire's own answer
 *   has to close that path quietly.
 * - 503 "shared skills not configured": the deployment runs no store.
 *
 * On any of these the new skill simply stays agent-local — exactly the
 * pre-HOU-1192 behavior. Structural on `.status` + body, never on message
 * strings (the sibling classifiers' rule).
 */
export function isOrgSkillShareDeclined(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: unknown; body?: unknown };
  if (e.status === 409 || e.status === 403 || e.status === 404) return true;
  const body = e.body as { error?: unknown } | null;
  return e.status === 503 && body?.error === "shared skills not configured";
}

export interface OrgSkillShareDeps {
  /** The creator's local SKILL.md, or null when no local copy exists. */
  loadLocalContent(agentPath: string, slug: string): Promise<string | null>;
  /** "Share to workspace": the full SKILL.md verbatim at the exact slug. */
  promote(workspaceId: string, slug: string, content: string): Promise<void>;
  /** Enable the slug in one agent's shared-skills manifest. */
  enable(agentPath: string, slug: string): Promise<void>;
  deleteLocal(agentPath: string, slug: string): Promise<void>;
  /** Runs after the enables and BEFORE the reload/compare/delete of the
   *  creator's copy (the hook refreshes the caches the merged strip reads
   *  here). Kept separate from `deleteLocal` so the compare sits directly
   *  against the delete — anything slow in between widens the window in
   *  which an agent's concurrent edit could be compared stale. */
  beforeDelete?(): Promise<void>;
}

export type OrgSkillShareResult =
  /** In the store; `creatorEnabled` is the creator's one manifest write.
   *  `localDeleted` is false when the creator's copy diverged mid-flight
   *  (it stays as an override). */
  | { outcome: "shared"; creatorEnabled: boolean; localDeleted: boolean }
  /** The store declined (collision / role / no store) — skill stays local. */
  | { outcome: "kept-local" }
  /** No local copy to share (already promoted, or deleted) — nothing to do. */
  | { outcome: "skipped" };

/**
 * Promote a freshly agent-created skill to the workspace store and install it
 * to the ONE agent that built it. Other agents are deliberately untouched —
 * the store row is where the user installs it to them. Ordering is
 * load-bearing:
 *
 * 1. Promote first — until it succeeds nothing else may move.
 * 2. Enable the CREATOR's manifest: the local copy is only deleted after the
 *    creator can load the shared one, so there is no window where the skill
 *    exists nowhere for the agent that just built it.
 * 3. Delete the local copy only when it is still byte-identical to what was
 *    promoted AND the creator's enable landed — a copy the agent edited
 *    mid-flight survives as that agent's override (never data loss).
 *
 * Unexpected promote failures are rethrown for the caller's surfacing path;
 * everything else resolves.
 */
export async function shareNewSkillToWorkspace(
  deps: OrgSkillShareDeps,
  args: { workspaceId: string; creatorPath: string; slug: string },
): Promise<OrgSkillShareResult> {
  const { workspaceId, creatorPath, slug } = args;
  const content = await deps.loadLocalContent(creatorPath, slug);
  if (content === null) return { outcome: "skipped" };

  try {
    await deps.promote(workspaceId, slug, content);
  } catch (err) {
    if (isOrgSkillShareDeclined(err)) return { outcome: "kept-local" };
    throw err;
  }

  let creatorEnabled = false;
  try {
    await deps.enable(creatorPath, slug);
    creatorEnabled = true;
  } catch {
    // The failed manifest write surfaced through the caller's path; the
    // identical local copy stays (no delete below), so the creator keeps
    // the skill either way.
  }

  let localDeleted = false;
  if (creatorEnabled) {
    try {
      await deps.beforeDelete?.();
      const current = await deps.loadLocalContent(creatorPath, slug);
      if (current === null) {
        localDeleted = true; // already gone — nothing shadowing
      } else if (current === content) {
        await deps.deleteLocal(creatorPath, slug);
        localDeleted = true;
      }
    } catch {
      // The shared copy is live and the identical local one shadows it —
      // harmless; the Skills page shows it as an override the user can drop.
    }
  }

  return { outcome: "shared", creatorEnabled, localDeleted };
}
