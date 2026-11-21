export interface ColorStorage {
  getItem(key: string): string | null;
}

export interface LegacyColorLookup {
  byId: Record<string, string>;
  byName: Record<string, string>;
  colorFor(id: string, name: string): string | undefined;
}

const CP_COLOR_KEY = "houston.web.cp.agentColors";
const STANDALONE_AGENTS_KEY = "houston.web.agents";

const normalizeName = (name: string) => name.trim().toLowerCase();

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

export function readLegacyAgentColors(
  storage: ColorStorage | null = defaultStorage(),
): LegacyColorLookup {
  const byId: Record<string, string> = {};
  const byName: Record<string, string> = {};

  if (storage) {
    const cp = readJson(storage, CP_COLOR_KEY);
    if (isRecord(cp)) {
      for (const [id, color] of Object.entries(cp)) {
        if (typeof color === "string" && color) byId[id] = color;
      }
    }

    const store = readJson(storage, STANDALONE_AGENTS_KEY);
    if (isRecord(store)) {
      for (const list of Object.values(store)) {
        if (!Array.isArray(list)) continue;
        for (const agent of list) {
          if (!isRecord(agent)) continue;
          const { id, name, color } = agent;
          if (typeof color !== "string" || !color) continue;
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
