import type { IncomingMessage, ServerResponse } from "node:http";
import type { InstalledAgentConfig } from "@houston/protocol";
import type { UserId } from "../domain/types";
import { normalizeSource } from "../skills/github-parse";
import type { Vfs } from "../vfs";
import { json, readJson } from "./http";

/**
 * The installed agent-config library: `houston.json` templates the user added
 * (today: from a GitHub repo) that the create-agent picker merges alongside the
 * bundled first-party templates. This is the TS-host successor of the Rust
 * engine's `/agent-configs` + `/agents/install-from-github` surface (HOU-662);
 * the store catalog/updates half of that surface stays cut.
 *
 * Layout under `root(userId)` (mirrors the legacy `~/.houston/agents` tree so
 * desktop users keep their previously installed configs):
 *   <root>/<agentId>/houston.json   the manifest (required)
 *   <root>/<agentId>/CLAUDE.md      instructions (optional)
 *   <root>/<agentId>/.source.json   install provenance {repo, installedAt}
 */
export interface AgentConfigsDeps {
  vfs: Vfs;
  /** Library prefix for this user (never empty). Local: "agents"; cloud: per-user. */
  root(userId: UserId): string;
  /** Injection point for tests; production uses the global fetch. */
  fetchImpl?: typeof fetch;
}

const GH_HEADERS = { "User-Agent": "houston-agents/1.0" };

/** A library id must be a single safe path segment (it becomes a vfs key). */
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** Fetch one repo file's raw content (main → master), or null when absent. */
async function fetchRepoFile(
  fetchImpl: typeof fetch,
  source: string,
  file: string,
): Promise<string | null> {
  for (const branch of ["main", "master"]) {
    const res = await fetchImpl(
      `https://raw.githubusercontent.com/${source}/${branch}/${file}`,
      { headers: GH_HEADERS },
    );
    if (res.ok) return await res.text();
    if (res.status !== 404) {
      throw new Error(
        `GitHub returned ${res.status} fetching '${file}' from ${source}`,
      );
    }
  }
  return null;
}

async function listInstalled(
  deps: AgentConfigsDeps,
  userId: UserId,
): Promise<InstalledAgentConfig[]> {
  const root = deps.root(userId);
  const keys = await deps.vfs.list(root);
  const suffix = "/houston.json";
  const out: InstalledAgentConfig[] = [];
  for (const key of keys) {
    // Exactly <root>/<id>/houston.json — nested matches are the config's own files.
    const rel = key.slice(root.length + 1);
    if (!rel.endsWith(suffix) || rel.split("/").length !== 2) continue;
    const path = key.slice(0, -suffix.length);
    const raw = await deps.vfs.readText(key);
    if (raw === null) continue; // raced with a delete
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // A malformed manifest hides one library entry, not the whole list; the
      // picker still renders and the entry is recoverable by reinstalling.
      console.warn(`[agent-configs] skipping malformed manifest: ${key}`);
      continue;
    }
    // The create flow seeds the new agent's CLAUDE.md client-side from the
    // config, so inline the sibling file when the manifest doesn't embed one.
    if (typeof config.claudeMd !== "string") {
      const claudeMd = await deps.vfs.readText(`${path}/CLAUDE.md`);
      if (claudeMd !== null) config = { ...config, claudeMd };
    }
    out.push({ config, path });
  }
  return out;
}

async function installFromGithub(
  deps: AgentConfigsDeps,
  userId: UserId,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJson(req);
  const githubUrl = typeof body.githubUrl === "string" ? body.githubUrl : "";
  const source = normalizeSource(githubUrl);
  if (!source) {
    return json(res, 400, {
      error: `'${githubUrl.trim()}' doesn't look like a GitHub repository`,
    });
  }
  const fetchImpl = deps.fetchImpl ?? fetch;
  let manifest: string | null;
  try {
    manifest = await fetchRepoFile(fetchImpl, source, "houston.json");
  } catch (err) {
    return json(res, 502, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  if (manifest === null) {
    return json(res, 404, {
      error: `No houston.json found in '${source}'. Is it a Houston agent repo?`,
    });
  }
  let config: Record<string, unknown>;
  try {
    config = JSON.parse(manifest) as Record<string, unknown>;
  } catch {
    return json(res, 400, {
      error: `houston.json in '${source}' is not valid JSON`,
    });
  }
  const agentId = config.id;
  if (typeof agentId !== "string" || !SAFE_ID.test(agentId)) {
    return json(res, 400, {
      error: `houston.json in '${source}' is missing a valid 'id'`,
    });
  }

  const dir = `${deps.root(userId)}/${agentId}`;
  await deps.vfs.writeText(`${dir}/houston.json`, manifest);
  // Instructions are optional; a fetch failure here loses seeding, not the
  // install, so surface it as the route's error instead of writing a half entry.
  let claudeMd: string | null;
  try {
    claudeMd = await fetchRepoFile(fetchImpl, source, "CLAUDE.md");
  } catch (err) {
    return json(res, 502, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  if (claudeMd !== null) await deps.vfs.writeText(`${dir}/CLAUDE.md`, claudeMd);
  await deps.vfs.writeText(
    `${dir}/.source.json`,
    JSON.stringify({ repo: source, installedAt: new Date().toISOString() }),
  );
  json(res, 200, { agentId });
}

/**
 * Account-level agent-config routes: GET /v1/agent-configs (the library, fed
 * into the create-agent picker) and POST /v1/agents/install-from-github (add a
 * repo's houston.json to the library). Returns true when handled.
 */
export async function handleAgentConfigs(
  deps: { agentConfigs?: AgentConfigsDeps },
  userId: UserId,
  method: string,
  path: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const isList = method === "GET" && path === "/v1/agent-configs";
  const isInstall =
    method === "POST" && path === "/v1/agents/install-from-github";
  if (!isList && !isInstall) return false;

  const lib = deps.agentConfigs;
  if (!lib) {
    // No library wired: an empty list is the honest read (nothing installed
    // here), but an install must fail loudly rather than pretend to work.
    if (isList) json(res, 200, []);
    else json(res, 503, { error: "agent-config library not configured" });
    return true;
  }
  if (isList) json(res, 200, await listInstalled(lib, userId));
  else await installFromGithub(lib, userId, req, res);
  return true;
}
