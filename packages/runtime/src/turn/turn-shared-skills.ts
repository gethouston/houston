import { mkdir, readdir, rm } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import {
  HttpObjectStore,
  type ObjectMetadata,
  type ObjectStore,
} from "@houston/runtime-client/object-sync";
import { loadSkillsManifest } from "../session/skills-manifest";
import type { TurnStoreConfig } from "./turn-store";
import { poolIdentity } from "./turn-store";
import type { TurnRequest } from "./types";

const SKILLS_DIR = "skills";
const DOWNLOADS_AT_ONCE = 8;
const SNAPSHOT_DEADLINE_MS = 15_000;

export function turnSharedSkillsDir(turnRoot: string): string {
  return join(turnRoot, "shared-skills");
}

export function turnSharedSkillsStore(
  turn: Pick<TurnRequest, "gcsPrefix" | "claim" | "hostToken">,
  config: TurnStoreConfig = {},
): ObjectStore | null {
  const poolStoreUrl =
    config.poolStoreUrl ?? process.env.HOUSTON_POOL_STORE_URL;
  if (!turn.claim || !turn.hostToken || !poolStoreUrl) return null;
  const { org, agent } = poolIdentity(turn.gcsPrefix);
  const root = poolStoreUrl.replace(/\/+$/, "");
  return new HttpObjectStore({
    baseUrl: `${root}/v1/pod/store/${encodeURIComponent(org)}/shared`,
    token: turn.hostToken,
    agentSlug: agent,
    ...(config.fetchImpl ? { fetchImpl: config.fetchImpl } : {}),
  });
}

function skillOf(key: string): string | null {
  if (!key.startsWith(`${SKILLS_DIR}/`)) return null;
  const segments = key.slice(SKILLS_DIR.length + 1).split("/");
  if (segments.length < 2 || segments.some((s) => s === "" || s === ".."))
    return null;
  return segments[0] ?? null;
}

export async function snapshotTurnSharedSkills(
  store: ObjectStore | null,
  dest: string,
  workspaceDir: string,
  deadlineMs: number = SNAPSHOT_DEADLINE_MS,
): Promise<void> {
  if (!store?.manifest) return;
  const stop = new AbortController();
  const timer = setTimeout(
    () => stop.abort(new Error(`shared skills took over ${deadlineMs} ms`)),
    deadlineMs,
  );
  try {
    const enabled = new Set(loadSkillsManifest(workspaceDir).enabled);
    if (enabled.size === 0) return;
    const root = resolve(dest);
    const listed: ObjectMetadata[] = await Promise.race([
      store.manifest(SKILLS_DIR, { signal: stop.signal }),
      new Promise<never>((_resolve, reject) =>
        stop.signal.addEventListener(
          "abort",
          () => reject(stop.signal.reason),
          {
            once: true,
          },
        ),
      ),
    ]);
    const queue = listed.filter((object) => {
      const skill = skillOf(object.key);
      return skill !== null && enabled.has(skill);
    });
    const reader = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        stop.signal.throwIfAborted();
        const rel = next.key.slice(SKILLS_DIR.length + 1).split("/");
        const file = resolve(root, ...rel);
        if (!file.startsWith(`${root}${sep}`)) continue;
        await mkdir(dirname(file), { recursive: true, mode: 0o755 });
        await store.download(next.key, file, { signal: stop.signal });
      }
    };
    const readers = await Promise.allSettled(
      Array.from({ length: DOWNLOADS_AT_ONCE }, () =>
        reader().catch((error: unknown) => {
          stop.abort(error);
          throw error;
        }),
      ),
    );
    const failed = readers.find((result) => result.status === "rejected");
    if (failed) throw stop.signal.reason ?? failed.reason;
  } catch (error) {
    console.error(
      "[shared-skills] the turn runs without its org's shared skills:",
      error instanceof Error ? error.message : String(error),
    );
    await clearSnapshot(dest);
  } finally {
    clearTimeout(timer);
  }
}

export async function snapshotPooledTurnSharedSkills(
  deps: { sharedSkillsStore?: typeof turnSharedSkillsStore },
  turn: Pick<TurnRequest, "gcsPrefix" | "claim" | "hostToken">,
  storeConfig: TurnStoreConfig,
  at: { root: string; workspaceDir: string; timings: Record<string, number> },
): Promise<void> {
  await snapshotTurnSharedSkills(
    (deps.sharedSkillsStore ?? turnSharedSkillsStore)(turn, storeConfig),
    turnSharedSkillsDir(at.root),
    at.workspaceDir,
  );
  at.timings.t_shared_skills = performance.now();
}

async function clearSnapshot(dest: string): Promise<void> {
  try {
    const left = await readdir(dest);
    await Promise.all(
      left.map((entry) =>
        rm(join(dest, entry), { recursive: true, force: true }),
      ),
    );
  } catch (error) {
    console.error(
      "[shared-skills] could not clear a partial snapshot:",
      error instanceof Error ? error.message : String(error),
    );
  }
}
