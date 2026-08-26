import { deadGoogleApiKey } from "@houston/protocol/google-key";
import type { CaptureResult, CredentialStore, RuntimeEndpoint } from "../ports";
import { scrubRuntimeRefreshToken } from "./scrub-refresh";

type ExportedCredential = {
  provider?: string;
  kind?: "oauth" | "api_key";
  access?: string;
  refresh?: string;
  expires?: number;
  key?: string;
  accountId?: string;
  enterpriseUrl?: string;
};

/**
 * Store a full runtime credential centrally, then remove its refresh token.
 *
 * Scoped by `actingAs` end to end (HOU-976): the runtime keeps one auth file per
 * member, so the export must be read AS that member, the central write must land
 * on that member's row, and the scrub must clear that member's file — mixing the
 * three would capture one member's credential into another's row. Undefined (the
 * desktop, self-host, every pre-HOU-976 caller) is the single shared scope,
 * byte-identical to before.
 *
 * Idempotent settlement (PRODUCT-1318): the two halves (central PUT, runtime
 * scrub) can each be replayed safely, so a retry of the WHOLE capture after an
 * ambiguous response converges instead of erroring or double-writing — a
 * post-scrub replay finds nothing exportable and settles against the central
 * store; a post-PUT/pre-scrub replay re-PUTs the same family and re-attempts
 * the scrub.
 */
export async function captureRuntimeCredential(args: {
  endpoint: RuntimeEndpoint;
  credentials: CredentialStore;
  workspaceId: string;
  provider?: string;
  /**
   * The serve healer's contract (an AUTOMATIC capture with no user behind it):
   * only accept credentials that provably originate from a local login, never a
   * projection of a row the central store already owns/owned. For OAuth that
   * proof is structural — the runtime only ever exports refresh-BEARING entries,
   * and a serve-written projection is access-only (Gate #2). For an api_key —
   * byte-identical whether pasted locally or serve-written — the runtime holds
   * the proof (its served-providers manifest), so this flag rides to
   * `/auth/export` as `excludeServed=1` and a returned api_key is attested
   * local-origin (PRODUCT-1370: the pasted Anthropic setup token heals this
   * way). Without the manifest gate, a healer re-push of a pod's leftover
   * served api_key would resurrect a credential the user disconnected.
   */
  localOriginOnly?: boolean;
  actingAs?: string;
  /**
   * Fill-only central write, for AUTOMATIC re-pushes (the serve healer). The
   * gateway's credential PUT doubles as the user's "I reconnected" signal: a
   * plain PUT clears the revocation tombstone guarding a provider-revoked
   * family (cloud #230). An automatic re-push of a pod's leftover copy must
   * never do that — `ifAbsent` rides to the store as the maintenance contract
   * (`x-houston-if-absent`), which fills a missing row without clobbering a
   * rotated refresh token or resurrecting a tombstoned one. A real
   * user-initiated (re)connect omits it and overwrites.
   */
  ifAbsent?: boolean;
}): Promise<CaptureResult> {
  const {
    endpoint,
    credentials,
    workspaceId,
    provider,
    localOriginOnly,
    actingAs,
    ifAbsent,
  } = args;
  const params = new URLSearchParams();
  if (provider) params.set("provider", provider);
  if (localOriginOnly) params.set("excludeServed", "1");
  const query = params.size ? `?${params}` : "";
  const exported = await fetch(`${endpoint.baseUrl}/auth/export${query}`, {
    headers: {
      Authorization: `Bearer ${endpoint.token}`,
      ...(actingAs ? { "x-houston-acting-as": actingAs } : {}),
    },
  });
  if (!exported.ok) {
    return {
      ok: false,
      status: 502,
      error: "could not read agent credential",
      detail: await exported.text().catch(() => ""),
    };
  }
  const credential = (await exported.json()) as ExportedCredential;
  if (credential.kind === "api_key") {
    // No post-PUT scrub for an api_key (unlike the OAuth path below): there is
    // no refresh token to strip, and the entry deliberately STAYS in auth.json
    // — on the desktop the serve path never re-supplies anthropic
    // (routes/credential.ts refuses it there), so scrubbing/removing the pasted
    // setup token would disconnect the provider the user just connected.
    if (!credential.provider || !credential.key)
      return { ok: false, status: 400, error: "agent is not connected yet" };
    if (
      deadGoogleApiKey({
        provider: credential.provider,
        kind: "api_key",
        access: credential.key,
      })
    ) {
      // A legacy pre-verification runtime entry (HOU-1107). Capturing it would
      // seed the central store with a key every serve immediately refuses
      // (Sentry HOUSTON-APP-567) — reject it so the connect flow shows the
      // paste-a-key card instead of a false "connected".
      return {
        ok: false,
        status: 400,
        error:
          "the stored google credential is an OAuth-type token, not an API key — reconnect google by pasting a Gemini API key",
      };
    }
    await credentials.put(
      {
        workspaceId,
        provider: credential.provider,
        kind: "api_key",
        accessToken: credential.key,
        refreshToken: "",
        expiresAt: Number.MAX_SAFE_INTEGER,
        // Azure exports its per-resource endpoint beside the key — a central
        // row without it serves a key aimed at nothing (PRODUCT-1532).
        ...(credential.enterpriseUrl
          ? { enterpriseUrl: credential.enterpriseUrl }
          : {}),
      },
      { actingAs, ifAbsent },
    );
    return { ok: true, provider: credential.provider };
  }
  if (
    !credential.provider ||
    !credential.access ||
    !credential.refresh ||
    typeof credential.expires !== "number"
  ) {
    // Nothing exportable — EITHER the runtime truly holds no credential, OR a
    // previous capture already landed and scrubbed it (a scrubbed entry has
    // refresh="" and exports as {}). A capture retried after an ambiguous
    // response (the web client's provider-capture-retry) must settle as
    // success here instead of failing a connect that actually worked; the
    // central store is the arbiter.
    if (provider && (await settledCentrally(credentials, args))) {
      return { ok: true, provider };
    }
    return { ok: false, status: 400, error: "agent is not connected yet" };
  }
  await credentials.put(
    {
      workspaceId,
      provider: credential.provider,
      kind: "oauth",
      accessToken: credential.access,
      refreshToken: credential.refresh,
      accountId: credential.accountId,
      expiresAt: credential.expires,
      enterpriseUrl: credential.enterpriseUrl,
    },
    { actingAs, ifAbsent },
  );
  const scrub = await scrubRuntimeRefreshToken(
    `${endpoint.baseUrl}/auth/scrub-refresh`,
    endpoint.token,
    credential.provider,
    actingAs,
  );
  if (!scrub.ok) {
    // The central PUT landed — the connect SUCCEEDED. Failing the capture here
    // (the old behavior) made the client replay the entire capture, whose
    // fresh full PUT clears revocation tombstones, while the refresh-bearing
    // runtime entry it never fixed silently kept the pod rotating the family
    // alongside the gateway (two rotators → mutual invalid_grant → org-wide
    // sign-out). Settle instead: the retries above are exhausted, the leftover
    // entry itself is the durable memory, and the runtime's next serve sync
    // finishes the scrub once central serves this same access token
    // (runtime auth/capture-settlement.ts). Loud, not silent:
    console.error(
      `[capture] PRODUCT-1318: captured ${credential.provider} centrally but scrubbing the runtime's refresh token failed after retries — the serve-sync self-heal will finish it${scrub.detail ? ` (${scrub.detail})` : ""}`,
    );
  }
  return { ok: true, provider: credential.provider };
}

/**
 * Whether the central store already holds a credential for the requested
 * provider on this caller's row — the settlement probe for a replayed capture
 * that finds nothing left to export. A probe failure is logged and read as
 * "not settled": the caller then reports the same honest "not connected yet"
 * it always did.
 */
async function settledCentrally(
  credentials: CredentialStore,
  args: { workspaceId: string; provider?: string; actingAs?: string },
): Promise<boolean> {
  if (!args.provider) return false;
  try {
    return (
      (await credentials.get(args.workspaceId, args.provider, {
        actingAs: args.actingAs,
      })) !== null
    );
  } catch (err) {
    console.warn(
      `[capture] settlement probe for ${args.provider} failed:`,
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
