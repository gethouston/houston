/**
 * Reader for the legacy client-side agent COLOR overlays (HOU-719, "keep the
 * colors through the cloud migration").
 *
 * An agent's color is a client-only cosmetic — it never crosses the wire (the
 * control plane's model is id/name only). The desktop→cloud migration runs in
 * the SAME webview that previously ran the legacy LOCAL profile, so the old
 * colors are still sitting in this webview's `localStorage`, in one of two
 * shapes depending on which adapter that install used:
 *
 *  - `houston.web.cp.agentColors` — the control-plane/local-host overlay:
 *    `Record<agentId, color>`, no names. A local host's agent id is derived
 *    from its on-disk path (`"<Workspace>/<Agent>"`), which is exactly the
 *    `SourceAgent.id` the migration scan reports — so these match by id.
 *  - `houston.web.agents` — the standalone (no-host) store:
 *    `Record<workspaceId, Agent[]>`, each agent an object with `id` + `name` +
 *    `color`. Its ids are random UUIDs that won't match a source id, so those
 *    only match by (normalized) name.
 *
 * Pure + injectable storage so it can be unit-tested without a DOM.
 */

/** The subset of the `Storage` interface this reader touches. */
export interface ColorStorage {
  getItem(key: string): string | null;
}

/** color by legacy agent id, and by normalized name; resolver applies id-first. */
export interface LegacyColorLookup {
  /** color keyed by legacy agent id (both overlays; local cp ids are paths). */
  byId: Record<string, string>;
  /** color keyed by normalized name (standalone store only — the cp overlay
   *  carries no names). */
  byName: Record<string, string>;
  /**
   * Resolve a source agent's saved color: exact id first (the local overlay),
   * then a normalized-name fallback (the standalone store). `undefined` when
   * neither has it — callers must NOT default here; the create path applies
   * its own `DEFAULT_AGENT_COLOR`.
   */
  colorFor(id: string, name: string): string | undefined;
}

const CP_COLOR_KEY = "houston.web.cp.agentColors";
const STANDALONE_AGENTS_KEY = "houston.web.agents";

const normalizeName = (name: string) => name.trim().toLowerCase();

/** The webview's `localStorage`, or `null` when storage is disabled/blocked. */
function defaultStorage(): ColorStorage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

function readJson(storage: ColorStorage, key: string): unknown {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return undefined;
  }
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Build the color lookup from both legacy overlays. Guards every failure mode
 * (missing keys, corrupt JSON, storage disabled, unexpected shapes) by yielding
 * an empty map — a missing color is never an error, the migrated agent just
 * gets the default. The cp overlay wins id collisions (it is the authoritative
 * per-agent color); across standalone workspaces, first name wins.
 */
export function readLegacyAgentColors(
  storage: ColorStorage | null = defaultStorage(),
): LegacyColorLookup {
  const byId: Record<string, string> = {};
  const byName: Record<string, string> = {};

  if (storage) {
    // cp overlay: Record<agentId, color> (local host ids are "<Workspace>/<Agent>").
    const cp = readJson(storage, CP_COLOR_KEY);
    if (isRecord(cp)) {
      for (const [id, color] of Object.entries(cp)) {
        if (typeof color === "string" && color) byId[id] = color;
      }
    }

    // standalone store: Record<workspaceId, Agent[]>, each { id, name, color }.
    const store = readJson(storage, STANDALONE_AGENTS_KEY);
    if (isRecord(store)) {
      for (const list of Object.values(store)) {
        if (!Array.isArray(list)) continue;
        for (const agent of list) {
          if (!isRecord(agent)) continue;
          const { id, name, color } = agent;
          if (typeof color !== "string" || !color) continue;
          // cp overlay is authoritative for a matching id — don't overwrite it.
          if (typeof id === "string" && id && !(id in byId)) byId[id] = color;
          if (typeof name === "string" && name) {
            const key = normalizeName(name);
            if (!(key in byName)) byName[key] = color;
          }
        }
      }
    }
  }

  return {
    byId,
    byName,
    colorFor(id, name) {
      return byId[id] ?? byName[normalizeName(name)];
    },
  };
}
