import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
// `getModel` is pi-ai's legacy static-catalog read, preserved on `/compat`
// (the new `Models`/`Provider` collection API needs an instantiated registry
// we don't otherwise carry here). `BuiltinProvider` is the id union that read
// accepts — narrower than `KnownProvider`, which since pi 0.82 also names
// purely dynamic providers (radius) with no static catalog entry.
import { type BuiltinProvider, getModel } from "@earendil-works/pi-ai/compat";
import { authFailureActive } from "../auth/credential-health";
import { authStorage, providerConnected } from "../auth/storage";
import { config } from "../config";
import { endpointReachableCached } from "./endpoint-reachability";
import {
  buildActiveCustomModel,
  customEndpointConfigured,
  customModelId,
  OPENAI_COMPATIBLE,
  setCustomModelId,
} from "./openai-compatible";
import {
  isPiOAuthProvider,
  isPiProvider,
  piModelIds,
  piProviderIds,
} from "./pi-catalog";

/**
 * Supported providers. The provider id is the SAME string pi-ai uses for its
 * model provider, so a stored credential under `id` authenticates
 * `getModel(id, ...)` directly — whether that credential is an OAuth token
 * (Claude / Codex subscriptions) or a pasted API key (OpenCode Zen / Go,
 * OpenRouter, DeepSeek, Gemini, Amazon Bedrock, MiniMax global). The OpenAI-compatible
 * (local) provider is the exception — its model is hand-built (see
 * `./openai-compatible`), not fetched from a pi catalog.
 */
export type ProviderId =
  | "anthropic"
  | "openai-codex"
  | "github-copilot"
  | "opencode"
  | "opencode-go"
  | "openrouter"
  | "deepseek"
  | "google"
  | "amazon-bedrock"
  | "minimax"
  | "openai-compatible"
  // Any other pi-ai provider id (the catalog is ~35 providers and drifts). The
  // `(string & {})` widening accepts any provider id while keeping literal
  // autocomplete for the named ids above.
  | (string & {});

/**
 * How a provider authenticates:
 * - `oauth` — subscription sign-in (Claude / Codex / Copilot).
 * - `apiKey` — a pasted key for a built-in pi provider (OpenCode / OpenRouter / DeepSeek / Gemini / Bedrock / MiniMax).
 * - `openaiCompatible` — a user-supplied base URL + model id (+ optional key) for a
 *   local OpenAI-compatible server (Ollama / vLLM / LM Studio). LOCAL profile only:
 *   the URL is the user's own machine, unreachable from a cloud runtime.
 */
export type ProviderAuthMethod = "oauth" | "apiKey" | "openaiCompatible";

export const PROVIDERS: {
  id: ProviderId;
  name: string;
  defaultModel: string;
  auth: ProviderAuthMethod;
}[] = [
  {
    id: "anthropic",
    name: "Claude (Pro / Max)",
    defaultModel: config.model,
    auth: "oauth",
  },
  {
    id: "openai-codex",
    name: "ChatGPT / Codex (Plus / Pro)",
    defaultModel: config.codexModel,
    auth: "oauth",
  },
  {
    id: "github-copilot",
    name: "GitHub Copilot",
    defaultModel: config.githubCopilotModel,
    auth: "oauth",
  },
  {
    id: "opencode",
    name: "OpenCode Zen",
    defaultModel: config.opencodeModel,
    auth: "apiKey",
  },
  {
    id: "opencode-go",
    name: "OpenCode Go",
    defaultModel: config.opencodeGoModel,
    auth: "apiKey",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    defaultModel: config.openrouterModel,
    auth: "apiKey",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    defaultModel: config.deepseekModel,
    auth: "apiKey",
  },
  {
    id: "google",
    name: "Google Gemini",
    defaultModel: config.geminiModel,
    auth: "apiKey",
  },
  {
    id: "amazon-bedrock",
    name: "Amazon Bedrock",
    defaultModel: config.bedrockModel,
    auth: "apiKey",
  },
  {
    id: "minimax",
    name: "MiniMax",
    defaultModel: config.minimaxModel,
    auth: "apiKey",
  },
  {
    id: "openai-compatible",
    name: "Local model (OpenAI-compatible)",
    // No catalog default — the model id is whatever the user's server serves,
    // stored on the endpoint config (settings.customModel), read by modelFor().
    defaultModel: "",
    auth: "openaiCompatible",
  },
];

/**
 * A provider's auth method. A curated entry keeps its declared method verbatim.
 * An UNCURATED but pi-known provider is inferred from pi's registry: OAuth when
 * pi lists it as an OAuth provider, otherwise a pasted API key — so a pasted key
 * for e.g. `groq` is accepted (login.ts's setApiKey gate) instead of being sent
 * down an OAuth flow pi has no login for. A truly unknown id still defaults to
 * OAuth, so setApiKey rejects it.
 */
export function providerAuthMethod(id: string): ProviderAuthMethod {
  const curated = PROVIDERS.find((p) => p.id === id);
  if (curated) return curated.auth;
  if (isPiProvider(id)) return isPiOAuthProvider(id) ? "oauth" : "apiKey";
  return "oauth";
}

/**
 * A provider's default model id: a curated entry's configured default, else —
 * for an uncurated pi provider — the first model pi lists for it, else the Codex
 * default (a non-pi id with no catalog). Never throws / undefined.
 */
export function providerDefaultModel(id: string): string {
  const curated = PROVIDERS.find((p) => p.id === id);
  if (curated) return curated.defaultModel;
  return firstCatalogModel(id) ?? config.codexModel;
}

/** The first model id pi lists for a provider, or undefined when it has none. */
function firstCatalogModel(id: string): string | undefined {
  return piModelIds(id)[0];
}

/**
 * A provider Houston will accept: a curated id OR any provider pi-ai knows (its
 * live ~35-provider catalog). Widened additively so a pasted key for an
 * uncurated pi provider is selectable/resolvable; curated ids are unaffected.
 */
export const isProvider = (s: string): s is ProviderId =>
  PROVIDERS.some((p) => p.id === s) || isPiProvider(s);

type Settings = {
  activeProvider?: ProviderId;
  models?: Partial<Record<ProviderId, string>>;
  /** Reasoning effort applied to each turn (mapped to pi's thinking level). */
  effort?: string;
};

const settingsFile = join(config.dataDir, "settings.json");

function loadSettings(): Settings {
  if (!existsSync(settingsFile)) return {};
  try {
    return JSON.parse(readFileSync(settingsFile, "utf8")) as Settings;
  } catch {
    return {};
  }
}

function saveSettings(s: Settings) {
  const tmp = `${settingsFile}.tmp`;
  writeFileSync(tmp, JSON.stringify(s, null, 2));
  renameSync(tmp, settingsFile);
}

function defaultModel(provider: ProviderId): string {
  const found = PROVIDERS.find((p) => p.id === provider);
  if (found) return found.defaultModel;
  // Uncurated pi provider: no configured default, so start on the first model
  // pi lists for it rather than hard-failing the picker/turn.
  const first = firstCatalogModel(provider);
  if (first) return first;
  throw new Error(`unknown provider: ${provider}`);
}

export function modelFor(provider: ProviderId): string {
  if (provider === OPENAI_COMPATIBLE) return customModelId();
  return loadSettings().models?.[provider] ?? defaultModel(provider);
}

/**
 * Whether a provider is connected. For the OpenAI-compatible provider that means
 * the endpoint (base URL + model) is configured — NOT merely that a key exists,
 * since keyless local servers store only a placeholder key. Every other provider
 * is "connected" iff it has a STORED credential (`providerConnected`, the HOU-557
 * stored-only rule — env vars / overrides don't count and aren't logout-clearable).
 */
function providerConfigured(id: ProviderId): boolean {
  if (id === OPENAI_COMPATIBLE) return customEndpointConfigured();
  return providerConnected(authStorage, id);
}

/**
 * The STATUS-surface truth: configured AND currently able to serve a turn.
 * Two health signals layer on top of `providerConfigured`:
 * - `authFailureActive` — a turn already failed `unauthenticated` on this
 *   exact credential (auth/credential-health.ts), so "Connected" would be a
 *   lie until the credential changes or a turn succeeds;
 * - the local endpoint's reachability probe — a configured but stopped/
 *   unreachable OpenAI-compatible server must not offer its model.
 * Deliberately NOT used by the turn path (`activeProvider`): a turn on a
 * suspect provider should run and surface its REAL typed error (network card,
 * reconnect card) — and a clean turn is what heals a stale failure mark.
 */
function providerUsable(id: ProviderId): boolean {
  if (!providerConfigured(id)) return false;
  if (authFailureActive(id)) return false;
  return id === OPENAI_COMPATIBLE ? endpointReachableCached() : true;
}

/** The agent's saved reasoning effort for new turns, or null (model default). */
export function activeEffort(): string | null {
  return loadSettings().effort ?? null;
}

/**
 * Pure provider-selection policy (the IO wrapper is `activeProvider`).
 *
 * A SAVED provider is sticky: use it when connected, and return `null` when it
 * is logged out — NEVER another connected provider. Silently switching an agent
 * that is configured for one provider onto a different connected one (e.g.
 * answering an OpenAI chat with OpenRouter after the OpenAI logout) bills and
 * answers under a model the user never chose; the logged-out provider must
 * instead surface the reconnect card. The "first connected" fallback applies
 * ONLY when nothing is saved yet (a fresh agent's very first chat) so an initial
 * turn can start without a manual pick (#483).
 *
 * @param authedIds connected providers, in registry order.
 */
export function pickActiveProvider(
  saved: ProviderId | undefined,
  authedIds: ProviderId[],
): ProviderId | null {
  if (saved) return authedIds.includes(saved) ? saved : null;
  return authedIds[0] ?? null;
}

/**
 * Every provider that could be connected, in selection-precedence order: the
 * curated registry FIRST (unchanged order, so the first-connected fallback and
 * claim precedence for curated providers are identical to before), then any
 * other pi-known provider so a pasted key for an uncurated provider (e.g. groq)
 * becomes selectable. Extras are appended, never interleaved, so they can only
 * ever be the fallback when NO curated provider is connected.
 */
function candidateProviderIds(): ProviderId[] {
  const curated = PROVIDERS.map((p) => p.id);
  const seen = new Set(curated);
  const extras = piProviderIds().filter((id) => !seen.has(id));
  return [...curated, ...extras];
}

/** Connected providers in precedence order (curated first, then pi extras). */
function connectedProviderIds(): ProviderId[] {
  // `providerConfigured` over `providerConnected` so the OpenAI-compatible
  // provider counts when its endpoint is set (it has only a placeholder key).
  return candidateProviderIds().filter((id) => providerConfigured(id));
}

/**
 * The provider this agent's turns run on: the saved pick when connected, else —
 * only when nothing is saved — the first connected provider. `null` => no
 * provider connected for the saved pick, so the turn must surface the reconnect
 * card rather than silently switching.
 */
export function activeProvider(): ProviderId | null {
  return pickActiveProvider(
    loadSettings().activeProvider,
    connectedProviderIds(),
  );
}

/**
 * OpenCode's two gateways — `opencode` (Zen) and `opencode-go` (Go) — share ONE
 * opencode.ai key: a connect stores the credential under both ids (the client
 * fans the write out). The claim policy must treat them as a single connect —
 * after an OpenCode connect the freshly-lit sibling gateway is NOT an "already
 * connected" provider. Keep in sync with the frontend's `credentialSiblings`
 * (packages/web engine-adapter/synthetic.ts).
 */
const OPENCODE_GATEWAYS: readonly ProviderId[] = ["opencode", "opencode-go"];

function credentialSiblingIds(pid: ProviderId): ProviderId[] {
  return OPENCODE_GATEWAYS.includes(pid) ? [...OPENCODE_GATEWAYS] : [pid];
}

/**
 * Pure claim policy for a JUST-CONNECTED credential (IO wrapper:
 * `claimActiveProvider`). Connecting a provider is NOT a model pick (HOU-695):
 * an agent that already resolves to a provider — a saved pick, or the
 * first-connected fallback serving a fresh agent — must keep it, or every open
 * chat silently switches onto the new credential (and its quota errors: an
 * OpenCode key pasted mid-Codex-chat used to answer — and bill — the next turn
 * on OpenCode). Switching providers is exclusively the model picker's job.
 *
 * Returns the provider to SAVE, or `null` to leave settings untouched:
 * - something saved → `null`. Even a logged-out saved pick stays: the turn
 *   surfaces its reconnect card (`pickActiveProvider`), and the picker — which
 *   only offers connected providers — is the explicit way onto the new one.
 * - nothing saved, another provider (outside the connect's shared-key gateway
 *   siblings) already connected → THAT provider, now pinned. It was already
 *   serving turns via the first-connected fallback; writing it down keeps
 *   registry order from drifting the fallback onto the newcomer.
 * - nothing saved, nothing else connected → the just-connected provider (the
 *   fresh-agent first connect, #483's "first turn works without a pick").
 */
export function pickClaimedProvider(
  saved: ProviderId | undefined,
  authedIds: ProviderId[],
  connected: ProviderId,
  connectedSiblings: ProviderId[],
): ProviderId | null {
  if (saved) return null;
  const others = authedIds.filter((id) => !connectedSiblings.includes(id));
  return others[0] ?? connected;
}

/**
 * Claim the active provider for a just-connected credential — the connect-flow
 * counterpart of `setSettings({activeProvider})`, gated by `pickClaimedProvider`
 * so a connect can never move an agent that already has a provider (HOU-695).
 * The route hydrates centrally-served credentials first (`/settings/claim` →
 * `syncServedCredentialSafe`, kept there to avoid an ai↔auth import cycle) so
 * "already connected" sees the workspace's connect-once credentials, not just
 * this runtime's local file.
 */
export function claimActiveProvider(pid: string): Settings {
  if (!isProvider(pid)) throw new Error(`unknown provider: ${pid}`);
  const s = loadSettings();
  const authed = connectedProviderIds();
  const claim = pickClaimedProvider(
    s.activeProvider,
    authed,
    pid,
    credentialSiblingIds(pid),
  );
  if (!claim || claim === s.activeProvider) return s;
  return setSettings({ activeProvider: claim });
}

export function setSettings(input: {
  activeProvider?: string;
  model?: string;
  effort?: string;
}): Settings {
  const s = loadSettings();
  if (input.activeProvider) {
    if (!isProvider(input.activeProvider))
      throw new Error(`unknown provider: ${input.activeProvider}`);
    s.activeProvider = input.activeProvider;
  }
  if (input.model) {
    const prov = (input.activeProvider as ProviderId) ?? s.activeProvider;
    if (!prov) throw new Error("set a provider before choosing a model");
    // The OpenAI-compatible model id lives on the endpoint config, not the
    // per-provider model map — keep one source of truth so modelFor + the
    // built model agree.
    if (prov === OPENAI_COMPATIBLE) setCustomModelId(input.model);
    else s.models = { ...s.models, [prov]: input.model };
  }
  if (input.effort) s.effort = input.effort;
  saveSettings(s);
  return s;
}

/**
 * getModel for a provider+model, but read-time-safe against a LEGACY/stale id.
 *
 * A bare `getModel(provider, id)` THROWS for an id the provider doesn't offer.
 * The desktop's stored config could carry a legacy id (the migration runs on
 * the write/seed path — see packages/domain migrateProviderModel — but a
 * settings.json written before that fix, or hand-edited, can still hold one).
 * Rather than hard-fail the turn, fall back to the provider's catalog default
 * and emit a diagnostic (beta no-silent-failure: the user still gets a turn AND
 * the swap is logged for the bug tail). A pinned `override` (routine model) is
 * the one exception NOT auto-corrected, but it IS validated: an unavailable pin
 * throws a clean "model not available" Error (pi-ai's getModel returns
 * `undefined` rather than throwing) so the turn fails with a readable reason
 * instead of a downstream TypeError.
 */
export function safeGetModel(
  provider: string,
  modelId: string,
  pinned: boolean,
) {
  const pp = provider as BuiltinProvider;
  const mp = modelId as Parameters<typeof getModel>[1];
  if (pinned) {
    // pi-ai's getModel returns `undefined` (it never throws) for an id the
    // provider doesn't offer. A pinned id is NOT auto-corrected, but it must
    // still be validated here: returning undefined would crash the turn
    // downstream with a raw `Cannot read properties of undefined` TypeError.
    const m = getModel(pp, mp);
    if (!m) throw new Error(`${provider} model "${modelId}" is not available`);
    return m;
  }
  const offered = safeModelIds(provider as ProviderId);
  // Open-catalog gateways (opencode/opencode-go) return [] from getModels but
  // accept arbitrary ids — only guard when we actually have a catalog to check.
  if (offered.length > 0 && !offered.includes(modelId)) {
    const fallback = providerDefaultModel(provider);
    console.warn(
      `[providers] ${provider} model "${modelId}" is not offered; ` +
        `falling back to "${fallback}"`,
    );
    return getModel(pp, fallback as Parameters<typeof getModel>[1]);
  }
  return getModel(pp, mp);
}

/**
 * Canonicalize a wire provider id arriving on a turn PIN / provider override.
 *
 * Houston's UI RENAMES pi's `openai-codex` subscription to the display id
 * `openai` and never offers pi's raw platform-key `openai` provider (frontend
 * `PROVIDER_ID_RENAME` in `app/src/lib/provider-overrides.ts`; shared alias
 * table `PROVIDER_ALIASES` in `@houston/domain`). So on the wire a bare `openai`
 * ALWAYS means the Codex product. The frontend's `wireTurnPin` already applies
 * this before send; we enforce the SAME mapping here — the single pin-entry seam
 * every turn's provider override flows through (exec-turn, conversation-cache,
 * generate-agent) — so NO caller (the hosted Teams model-choice path, a routine
 * pin, a hand-crafted request body) can land a turn on pi's raw `openai`
 * provider and miss the `openai-codex` credential.
 *
 * TRADEOFF: this hard-codes that wire `openai` == Codex. If Houston ever offers
 * platform-key OpenAI as its own provider, THIS alias and the frontend rename
 * must be removed together.
 */
function canonicalPinProvider(id: string): string {
  return id === "openai" ? "openai-codex" : id;
}

/**
 * Resolve the pi-ai model for the active provider (used when starting a turn).
 * An optional `override` (a routine's pinned model) wins over the saved model;
 * a bad pin surfaces as the turn's error, while a stale SAVED id falls back to
 * the provider default (see safeGetModel) rather than hard-failing the turn. The
 * OpenAI-compatible provider isn't a pi KnownProvider, so it builds its model by
 * hand instead.
 *
 * `providerOverride` (a routine's pinned provider) wins over the saved active
 * provider and is never auth-gated — parity with the Rust engine's
 * resolve_provider_with_overrides: a disconnected pin surfaces as this turn's
 * provider error, never a silent switch to whatever provider happens to be
 * active. It is per-turn only: nothing here writes settings.json, so a routine
 * firing on its pinned provider never moves the agent's saved pick.
 */
export function resolveModel(
  override?: string | null,
  providerOverride?: string | null,
): Model<Api> {
  let provider: ProviderId | null;
  if (providerOverride) {
    const canonical = canonicalPinProvider(providerOverride);
    if (!isProvider(canonical))
      throw new Error(`unknown provider: ${providerOverride}`);
    provider = canonical;
  } else {
    provider = activeProvider();
  }
  if (!provider)
    throw new Error("No provider connected. Connect an AI provider first.");
  // The OpenAI-compatible (local) provider isn't a pi KnownProvider, so its
  // model is hand-built rather than fetched from a catalog. Every other provider
  // goes through safeGetModel, which validates a pinned id (a bad pin throws a
  // clean "model not available" error) but falls a stale SAVED id back to the
  // provider default rather than hard-failing the turn.
  if (provider === OPENAI_COMPATIBLE)
    return buildActiveCustomModel(override || undefined);
  return safeGetModel(provider, override || modelFor(provider), !!override);
}

function safeModelIds(provider: ProviderId): string[] {
  // The OpenAI-compatible provider has no pi catalog; its only "model" is the
  // single one the user configured on the endpoint.
  if (provider === OPENAI_COMPATIBLE) {
    const m = customModelId();
    return m ? [m] : [];
  }
  return piModelIds(provider);
}

/** One /providers status row for a provider id. `configured` reports the
 *  status-surface truth (`providerUsable`): the frontend maps it straight to
 *  authenticated/unauthenticated for the AI Models page and the chat model
 *  picker, so it must mean "this provider's models can actually answer",
 *  not merely "some credential/config artifact exists". */
function providerRow(id: ProviderId, name: string, active: ProviderId | null) {
  return {
    id,
    name,
    configured: providerUsable(id),
    isActive: id === active,
    activeModel: modelFor(id),
    models: safeModelIds(id),
  };
}

/**
 * The /providers status batch. Curated providers ALWAYS appear (unchanged). An
 * uncurated pi provider appears once it has a stored credential, so a pasted key
 * for e.g. groq is reflected — with its runnable pi model ids — while the common
 * case (nothing uncurated connected) keeps the exact shape it had before. Its
 * `name` is the raw pi id; the frontend catalog supplies display names/logos.
 */
export function listProviders() {
  const active = activeProvider();
  const curated = new Set(PROVIDERS.map((p) => p.id));
  const rows = PROVIDERS.map((p) => providerRow(p.id, p.name, active));
  for (const id of piProviderIds()) {
    if (!curated.has(id) && providerUsable(id))
      rows.push(providerRow(id, id, active));
  }
  return rows;
}
