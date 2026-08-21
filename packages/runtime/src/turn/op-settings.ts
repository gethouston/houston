import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { endpointFileIn, OPENAI_COMPATIBLE } from "../ai/openai-compatible";
import {
  credentialSiblingIds,
  isProvider,
  type ProviderId,
  pickClaimedProvider,
} from "../ai/providers";

/**
 * The agent's `settings.json` (active provider, per-provider model, effort)
 * for a SLEEPING agent, applied on a pool worker against the hydrated
 * runtime dir — the dataDir-bound twins of the live runtime's
 * `setSettings` / `claimActiveProvider` (`ai/providers.ts`), which are bound
 * to `config.dataDir` (the worker's own, never an agent's).
 *
 * The claim policy needs the connected providers; a worker has no auth.json,
 * so the gateway (the credential store's owner) sends the connected set.
 */
export type Settings = {
  activeProvider?: ProviderId;
  models?: Partial<Record<ProviderId, string>>;
  effort?: string;
};

export type SettingsOp =
  | {
      action: "put";
      input: { activeProvider?: string; model?: string; effort?: string };
    }
  | { action: "claim"; provider: string; connectedProviders: string[] };

const settingsFileIn = (dataDir: string) => join(dataDir, "settings.json");

function loadSettings(dataDir: string): Settings {
  const file = settingsFileIn(dataDir);
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Settings;
  } catch {
    return {};
  }
}

function writeJsonAtomic(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, file);
}

function setCustomModelIdIn(dataDir: string, model: string): void {
  const file = endpointFileIn(dataDir);
  let stored: Record<string, unknown> = {};
  if (existsSync(file)) {
    try {
      stored = JSON.parse(readFileSync(file, "utf8")) as Record<
        string,
        unknown
      >;
    } catch {
      stored = {};
    }
  }
  writeJsonAtomic(file, { ...stored, model });
}

/** Mirrors `setSettings`: validate, merge, persist. Throws on a bad input. */
export function putSettingsIn(
  dataDir: string,
  input: { activeProvider?: string; model?: string; effort?: string },
): Settings {
  const s = loadSettings(dataDir);
  if (input.activeProvider) {
    if (!isProvider(input.activeProvider))
      throw new Error(`unknown provider: ${input.activeProvider}`);
    s.activeProvider = input.activeProvider;
  }
  if (input.model) {
    const prov = (input.activeProvider as ProviderId) ?? s.activeProvider;
    if (!prov) throw new Error("set a provider before choosing a model");
    if (prov === OPENAI_COMPATIBLE) setCustomModelIdIn(dataDir, input.model);
    else s.models = { ...s.models, [prov]: input.model };
  }
  if (input.effort) s.effort = input.effort;
  writeJsonAtomic(settingsFileIn(dataDir), s);
  return s;
}

/** Mirrors `claimActiveProvider`: a connect never moves an agent that already
 *  resolves to a provider (HOU-695). */
export function claimActiveProviderIn(
  dataDir: string,
  pid: string,
  connectedProviders: string[],
): Settings {
  if (!isProvider(pid)) throw new Error(`unknown provider: ${pid}`);
  const s = loadSettings(dataDir);
  const authed = connectedProviders.filter(isProvider);
  const claim = pickClaimedProvider(
    s.activeProvider,
    authed,
    pid,
    credentialSiblingIds(pid),
  );
  if (!claim || claim === s.activeProvider) return s;
  return putSettingsIn(dataDir, { activeProvider: claim });
}

/** The runtime-dir files a settings op may touch (its sync-back scope). */
export function settingsOpFiles(dataRel: string): string[] {
  return [`${dataRel}/settings.json`, `${dataRel}/custom-endpoint.json`];
}
