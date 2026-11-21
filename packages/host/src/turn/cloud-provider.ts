import type { TurnPin } from "../ports";
import {
  cloudProviderUnavailable,
  isCloudProvider,
  isTurnServable,
  OPENAI_COMPATIBLE,
} from "../providers";
import {
  customEndpointKey,
  PROVIDER,
  readSettings,
  type TurnDeps,
} from "./deps";

const NO_ENDPOINT_ACTIVE =
  "No local endpoint configured for this agent — set a base URL and model for the OpenAI-compatible provider before starting a turn.";
const NO_ENDPOINT_PINNED =
  "This routine pins the OpenAI-compatible provider, but no endpoint is configured for this agent — connect one before it can run.";

export async function hasCustomEndpoint(
  deps: TurnDeps,
  prefix: string,
): Promise<boolean> {
  const raw = await deps.vfs.readText(customEndpointKey(prefix));
  if (!raw) return false;
  try {
    const e = JSON.parse(raw) as { baseUrl?: string; model?: string };
    return !!(e.baseUrl && e.model);
  } catch {
    return false;
  }
}

export async function resolveCloudTurn(
  deps: TurnDeps,
  prefix: string,
  pin: TurnPin | undefined,
): Promise<{ provider: string; effort?: string }> {
  if (pin?.provider) {
    const endpointReady =
      pin.provider === OPENAI_COMPATIBLE &&
      (await hasCustomEndpoint(deps, prefix));
    if (!isTurnServable(pin.provider, endpointReady))
      throw new Error(
        pin.provider === OPENAI_COMPATIBLE
          ? NO_ENDPOINT_PINNED
          : cloudProviderUnavailable(pin.provider),
      );
  }
  const settings = await readSettings(deps, prefix);
  const effort = pin?.effort ?? settings.effort;
  if (pin?.provider) return { provider: pin.provider, effort };

  const saved = settings.activeProvider;
  if (saved === OPENAI_COMPATIBLE) {
    if (!(await hasCustomEndpoint(deps, prefix)))
      throw new Error(NO_ENDPOINT_ACTIVE);
    return { provider: saved, effort };
  }
  return {
    provider: saved && isCloudProvider(saved) ? saved : PROVIDER,
    effort,
  };
}
