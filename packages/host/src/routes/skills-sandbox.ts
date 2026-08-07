import type { IncomingMessage, ServerResponse } from "node:http";
import type { EventHub } from "../events/hub";
import type { WorkspacePaths } from "../paths";
import type { CredentialVault, WorkspaceStore } from "../ports";
import type { CommunityDirectory } from "../skills/community";
import type { PreviewDirectory } from "../skills/preview";
import type { Vfs } from "../vfs";
import { bearer, json } from "./http";
import { installAction } from "./skills-sandbox-actions";
import { searchAction } from "./skills-sandbox-search";

/**
 * The RUNTIME-facing skills-directory routes (`/sandbox/skills/*`, authed by the
 * per-sandbox HMAC token). These back the agent's `find_skills` +
 * `install_skill` tools (PRODUCT-1238), so "which skill should I use for X?"
 * is answered by the agent itself instead of sending the user to the Skills
 * page.
 *
 * WHY a native route instead of installing Vercel's `find-skills` skill: that
 * skill's whole procedure is CLI calls (`npx skills find` / `npx skills add`).
 * pi ships no tool CLIs, `npx` would write to `~/.claude` rather than the
 * `.agents/skills/` tree pi actually loads, and the product prompt forbids
 * agents naming CLIs to a non-technical user. Everything the skill does over
 * the CLI, the host already does in-process: `CommunityDirectory` (cached,
 * rate-spaced skills.sh search) and `installCommunitySkill` (GitHub fetch →
 * frontmatter-preserving write through the workspace Vfs, so it works
 * identically on the desktop and in a cloud pod).
 *
 * Trust posture matches the other sandbox proxies: the tool holds no secret and
 * carries only the sandbox token; the host resolves that token to ONE workspace
 * and agent, so an install can only ever land in the calling agent's own tree.
 */

export interface SandboxSkillsDeps {
  vault: CredentialVault;
  store: WorkspaceStore;
  vfs?: Vfs;
  paths?: WorkspacePaths;
  events?: EventHub;
  /** Injection point for tests; production uses the global fetch. */
  fetchImpl?: typeof fetch;
  /**
   * Injection points for tests; production uses the process-wide singletons in
   * skills-directory.ts. `CommunityDirectory` captures its fetch at
   * construction, so a stubbed global fetch cannot reach the shared instance —
   * the seam has to be the directory itself.
   */
  directory?: Pick<CommunityDirectory, "search">;
  previews?: Pick<PreviewDirectory, "preview">;
}

export async function handleSandboxSkills(
  deps: SandboxSkillsDeps,
  method: string,
  path: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const action =
    path === "/sandbox/skills/search"
      ? "search"
      : path === "/sandbox/skills/install"
        ? "install"
        : null;
  if (!action) return false;
  if (method !== "POST") {
    json(res, 405, { error: "method not allowed" });
    return true;
  }

  // Authenticate the sandbox (NOT a user JWT) — same gate as /sandbox/credential.
  const claim = (() => {
    const token = bearer(req, url);
    return token ? deps.vault.validateSandboxToken(token) : null;
  })();
  if (!claim) {
    json(res, 401, { error: "unauthorized" });
    return true;
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  if (action === "search") {
    await searchAction(deps, req, res, fetchImpl);
    return true;
  }
  await installAction(deps, claim, req, res, fetchImpl);
  return true;
}
