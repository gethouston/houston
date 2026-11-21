import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { atomicTempPath } from "@houston/protocol";
import { endpointFileIn, OPENAI_COMPATIBLE } from "../ai/openai-compatible";
import {
  credentialSiblingIds,
  isProvider,
  type ProviderId,
  pickClaimedProvider,
} from "../ai/providers";

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

export function savedActiveProviderIn(dataDir: string): ProviderId | null {
  return loadSettings(dataDir).activeProvider ?? null;
}

function writeJsonAtomic(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = atomicTempPath(file);
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

export function settingsOpFiles(dataRel: string): string[] {
  return [`${dataRel}/settings.json`, `${dataRel}/custom-endpoint.json`];
}
