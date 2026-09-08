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

/**
 * The provider a `start_mission` call may pin, resolved against what is
 * connected for the TARGET agent's workspace — the host's half of the closed
 * set (`@houston/domain` provider-choice).
 *
 * The runtime's tool already offers the same set as its `provider` enum, but
 * those tool defs are frozen for the session while a connect/disconnect is not:
 * this is the live check, and the only one that sees the workspace a mission is
 * being pushed ONTO (the assistant starts work on other agents).
 *
 * Model ids are deliberately NOT validated here: the host's per-provider
 * `models` are a curated subset for the legacy cloud picker, so rejecting
 * against them would refuse ids the runtime can really run. The runtime's own
 * catalog is the authority (it checks the model as the tool is called), and a
 * bad id surfaces as the mission's first-turn provider error. A model is only
 * RESOLVED here — see {@link resolveMissionModel}.
 */

/** The tool this rejection is written for — it reads the sentence verbatim. */
const OPERATION = "start_mission";

export type ProviderResolution =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Resolve the written provider (id, display name, or alias) to a connected id,
 * or produce the refusal that names every id that would have worked.
 *
 * The happy path costs ONE credential read: only a value that does not resolve
 * to a connected provider pays for the full status sweep the message needs.
 */
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

/**
 * Resolve a written model to the id it names for `provider` — "Luna" →
 * `gpt-5.6-luna`, "Opus 4.6" → `claude-opus-4-6` — through the same table the
 * runtime's tool resolves against, so a name that arrives on the wire from any
 * other caller lands on the same id the tool would have sent.
 *
 * Never a refusal: a name this table cannot place rides through untouched (see
 * the note above on why the host does not judge model ids). Without a provider
 * to resolve against there is no table to consult, so the value is kept as
 * written — the runtime already resolved it against the provider the mission
 * inherits.
 */
export function resolveMissionModel(
  provider: string | undefined,
  raw: string,
): string {
  const written = raw.trim();
  if (!provider) return written;
  return resolveSpokenModel(provider, written)?.id ?? written;
}

/**
 * The providers this host would accept, with `connected` still unanswered. The
 * curated catalog carries the display names; a pi-known id the catalog does not
 * curate is added only when the caller actually named it, so the listing a
 * rejection prints stays the set a user would recognise.
 */
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

/**
 * Whether the workspace has a credential for `id`.
 *
 * Answers TRUE wherever the host cannot know, so a mission is never refused on
 * a status the host is not the keeper of: a deployment with no central store,
 * the OpenAI-compatible endpoint (its base URL + model live in the runtime's own
 * config), and `anthropic` on a desktop/self-host host (the runtime's shared
 * login dir is that credential's only holder — routes/credential.ts answers
 * "not served here" for it). The runtime's tool refuses those from its own
 * status before the call is ever made.
 */
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
    // A store that cannot answer is not a provider that is disconnected:
    // refusing here would block a mission over a transient read. Say so loudly
    // and let the pin through — the turn surfaces the real provider error.
    console.warn(
      `[missions] provider status for ${id} is unreadable, accepting the pin:`,
      err,
    );
    return true;
  }
}

/** Whether the host's central credential store is this provider's holder. */
function centrallyHeld(id: string, gatewayFronted?: boolean): boolean {
  if (id === OPENAI_COMPATIBLE) return false;
  if (id === "anthropic") return gatewayFronted === true;
  return true;
}
