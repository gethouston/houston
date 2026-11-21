import {
  canonicalProviderId,
  type ProviderOption,
  resolveProviderChoice,
  resolveSpokenModel,
} from "@houston/domain";
import {
  hostProvider,
  isKnownProvider,
  OPENAI_COMPATIBLE,
  PROVIDERS,
} from "../providers";
import type { MissionsCtx } from "./missions-sandbox";

const OPERATION = "start_mission";

export type ProviderResolution =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function resolveMissionProvider(
  ctx: MissionsCtx,
  raw: string,
): Promise<ProviderResolution> {
  const catalog = catalogFor(raw);
  const guess = resolveProviderChoice(raw, catalog, OPERATION);
  if (guess.ok && (await providerConnected(ctx, guess.id))) {
    return { ok: true, id: guess.id };
  }
  const options: ProviderOption[] = [];
  for (const option of catalog) {
    options.push({
      ...option,
      connected: await providerConnected(ctx, option.id),
    });
  }
  const resolved = resolveProviderChoice(raw, options, OPERATION);
  return resolved.ok
    ? { ok: true, id: resolved.id }
    : { ok: false, error: resolved.message };
}

export function resolveMissionModel(
  provider: string | undefined,
  raw: string,
): string {
  const written = raw.trim();
  if (!provider) return written;
  return resolveSpokenModel(provider, written)?.id ?? written;
}

function catalogFor(raw: string): ProviderOption[] {
  const base = PROVIDERS.map((p) => ({
    id: p.id,
    name: p.name,
    connected: true,
  }));
  const canonical = canonicalProviderId(raw.trim().toLowerCase());
  if (canonical && !hostProvider(canonical) && isKnownProvider(canonical)) {
    base.push({ id: canonical, name: canonical, connected: true });
  }
  return base;
}

async function providerConnected(
  ctx: MissionsCtx,
  id: string,
): Promise<boolean> {
  const store = ctx.deps.credentials;
  if (!store || !centrallyHeld(id, ctx.deps.gatewayFronted)) return true;
  try {
    const cred = await store.get(
      ctx.ws.id,
      id,
      ctx.actingAs ? { actingAs: ctx.actingAs } : undefined,
    );
    return cred !== null;
  } catch (err) {
    console.warn(
      `[missions] provider status for ${id} is unreadable, accepting the pin:`,
      err,
    );
    return true;
  }
}

function centrallyHeld(id: string, gatewayFronted?: boolean): boolean {
  if (id === OPENAI_COMPATIBLE) return false;
  if (id === "anthropic") return gatewayFronted === true;
  return true;
}
