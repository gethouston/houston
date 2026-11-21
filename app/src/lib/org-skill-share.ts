export function isOrgSkillShareDeclined(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: unknown; body?: unknown };
  if (e.status === 409 || e.status === 403 || e.status === 404) return true;
  const body = e.body as { error?: unknown } | null;
  return e.status === 503 && body?.error === "shared skills not configured";
}

export interface OrgSkillShareDeps {
  loadLocalContent(agentPath: string, slug: string): Promise<string | null>;
  promote(workspaceId: string, slug: string, content: string): Promise<void>;
  enable(agentPath: string, slug: string): Promise<void>;
  deleteLocal(agentPath: string, slug: string): Promise<void>;
  beforeDelete?(): Promise<void>;
}

export type OrgSkillShareResult =
  | { outcome: "shared"; creatorEnabled: boolean; localDeleted: boolean }
  | { outcome: "kept-local" }
  | { outcome: "skipped" };

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
  } catch {}

  let localDeleted = false;
  if (creatorEnabled) {
    try {
      await deps.beforeDelete?.();
      const current = await deps.loadLocalContent(creatorPath, slug);
      if (current === null) {
        localDeleted = true;
      } else if (current === content) {
        await deps.deleteLocal(creatorPath, slug);
        localDeleted = true;
      }
    } catch {}
  }

  return { outcome: "shared", creatorEnabled, localDeleted };
}
