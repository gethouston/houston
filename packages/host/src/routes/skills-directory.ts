import type { IncomingMessage, ServerResponse } from "node:http";
import { CommunityDirectory } from "../skills/community";
import { listSkillsFromRepo } from "../skills/github";
import { PreviewDirectory } from "../skills/preview";
import { SkillRemoteError } from "../skills/remote-error";
import { json, readJson } from "./http";

/**
 * The read-only marketplace surface: skills.sh search/popular and GitHub repo
 * discovery. These touch no workspace, so they're served both agent-scoped
 * (skills-remote.ts — what the web/desktop adapter and the engine-client wire
 * call; the hosted gateway proxies ONLY /agents/:slug/*, so this is the shape
 * that works everywhere) and top-level (`/v1/skills/...` — kept for direct
 * host API callers). One directory instance per process so the skills.sh
 * cache + request spacing are global (mirrors the Rust engine's static cache).
 */

const directory = new CommunityDirectory();
// One instance per process so the 24h preview cache (successes) + 10-min
// negative cache (failures) are global — same singleton style as `directory`.
const previews = new PreviewDirectory();

/**
 * The same two singletons, exported for the RUNTIME-facing sandbox route
 * (skills-sandbox.ts). The agent's `find_skills` tool must share this
 * process's skills.sh cache and request spacing with the UI's marketplace
 * calls — two directories would double the outbound rate against a service
 * that rate-limits, and the spacing that keeps us under it is per-instance.
 */
export { directory as communityDirectory, previews as previewDirectory };

/** Typed errors answer `{error: {code, message, kind, details: {kind}}}` so
 *  both `HoustonEngineError` shapes — the engine-client's (`details.kind`) and
 *  the web adapter's (`error.kind`) — surface the same taxonomy the Add Skills
 *  dialog matches on. */
export function failSkill(res: ServerResponse, err: unknown): void {
  if (err instanceof SkillRemoteError) {
    const code =
      err.httpStatus === 400
        ? "BAD_REQUEST"
        : err.httpStatus === 404
          ? "NOT_FOUND"
          : "UNAVAILABLE";
    json(res, err.httpStatus, {
      error: {
        code,
        message: err.message,
        kind: err.kind,
        details: { kind: err.kind },
      },
    });
    return;
  }
  json(res, 502, {
    error: err instanceof Error ? err.message : String(err),
  });
}

export async function communitySearchAction(
  req: IncomingMessage,
  res: ServerResponse,
  fetchImpl?: typeof fetch,
): Promise<void> {
  const body = await readJson(req);
  if (typeof body.query !== "string") {
    json(res, 400, { error: "missing 'query'" });
    return;
  }
  try {
    json(res, 200, await directory.search(body.query, { fetchImpl }));
  } catch (err) {
    failSkill(res, err);
  }
}

export async function communityPopularAction(
  res: ServerResponse,
  fetchImpl?: typeof fetch,
): Promise<void> {
  try {
    json(res, 200, await directory.popular({ fetchImpl }));
  } catch (err) {
    failSkill(res, err);
  }
}

export async function repoListAction(
  req: IncomingMessage,
  res: ServerResponse,
  fetchImpl: typeof fetch,
): Promise<void> {
  const body = await readJson(req);
  if (typeof body.source !== "string") {
    json(res, 400, { error: "missing 'source'" });
    return;
  }
  try {
    const { skills } = await listSkillsFromRepo(fetchImpl, body.source);
    json(res, 200, skills);
  } catch (err) {
    failSkill(res, err);
  }
}

export async function communityPreviewAction(
  req: IncomingMessage,
  res: ServerResponse,
  fetchImpl: typeof fetch,
): Promise<void> {
  const body = await readJson(req);
  if (typeof body.source !== "string" || typeof body.skillId !== "string") {
    json(res, 400, { error: "missing 'source' or 'skillId'" });
    return;
  }
  try {
    const preview = await previews.preview(
      fetchImpl,
      body.source,
      body.skillId,
    );
    json(res, 200, preview);
  } catch (err) {
    failSkill(res, err);
  }
}

/** Top-level (user-scoped, post-auth) marketplace reads. Returns true when handled. */
export async function handleSkillsDirectory(
  method: string,
  path: string,
  req: IncomingMessage,
  res: ServerResponse,
  deps: { fetchImpl?: typeof fetch } = {},
): Promise<boolean> {
  const m = path.match(
    /^\/v1\/skills\/(community\/(?:search|popular|preview)|repo\/list)$/,
  );
  if (!m) return false;
  if (method !== "POST") {
    json(res, 405, { error: "method not allowed" });
    return true;
  }
  const route = m[1];
  if (route === "community/search")
    await communitySearchAction(req, res, deps.fetchImpl);
  else if (route === "community/popular")
    await communityPopularAction(res, deps.fetchImpl);
  else if (route === "community/preview")
    await communityPreviewAction(req, res, deps.fetchImpl ?? fetch);
  else await repoListAction(req, res, deps.fetchImpl ?? fetch);
  return true;
}
