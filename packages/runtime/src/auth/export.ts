import { AZURE_OPENAI, azureBaseUrl } from "../ai/azure-openai";
import { config } from "../config";
import { currentCredentialScope } from "../session/acting-context";
import {
  authPathIn,
  type PiCred,
  readAuthFile,
  readServedProvidersAt,
  servedProvidersPathIn,
} from "./auth-file";

/** A full OAuth credential (access + refresh) the host captures centrally. */
export type ExportedOAuthCredential = {
  provider: string;
  access: string;
  refresh: string;
  expires: number;
  accountId?: string;
  enterpriseUrl?: string;
};

/**
 * A locally-connected API key (the pasted Anthropic setup token, an
 * OpenRouter/Gemini key…). `kind` is the wire discriminator the host's capture
 * branch keys on; an OAuth export carries no `kind` (the host reads absent as
 * oauth, matching every pre-existing runtime).
 */
export type ExportedApiKeyCredential = {
  provider: string;
  kind: "api_key";
  key: string;
  /** Azure OpenAI's per-resource endpoint, exported beside the key so the
   *  central row can serve it back to runtimes that never ran the connect
   *  (PRODUCT-1532). Rides the same non-secret slot Copilot Enterprise uses. */
  enterpriseUrl?: string;
};

export type ExportedCredential =
  | ExportedOAuthCredential
  | ExportedApiKeyCredential;

export type ExportOptions = {
  /**
   * Providers whose CURRENT auth.json entry was written by the serve path (the
   * served-providers manifest). An api_key entry for one of these is a mere
   * projection of a row the central store already owns — re-exporting it would
   * let the serve healer resurrect a credential the user disconnected centrally
   * (the store removed the row; the pod's leftover copy must not refill it).
   * OAuth entries don't need this gate: a serve-written oauth projection is
   * access-only (Gate #2) and structurally unexportable, and a refresh-BEARING
   * oauth entry is provably a fresh local login even when the manifest lists
   * its provider (the PRODUCT-1318 lost-scrub leftover, which the healer is
   * SUPPOSED to re-push).
   */
  servedProviders?: ReadonlySet<string>;
};

/**
 * Pure: choose the credential to export from an auth.json record. When
 * `provider` is given, returns EXACTLY that provider (connect-once capture is
 * provider-specific — capturing a github-copilot connect must never grab a
 * different provider that comes first in the record). Without a provider,
 * returns the first connected OAuth provider, then the first API key.
 *
 * Two exportable shapes (PRODUCT-1370):
 *  - an OAuth credential with BOTH access + refresh. Access-only oauth stays
 *    refused: that is a served projection or a scrubbed entry (refresh=""),
 *    and capturing it would seed the central store with a token that dies at
 *    first expiry.
 *  - an api_key entry (the pasted Anthropic setup token, a pasted provider
 *    key). Before this, the setup-token connect stored locally but the export
 *    answered {}, so capture 400'd, the gateway never stored anthropic, serve
 *    404'd, and the UI re-asked for the code forever.
 *
 * OAuth-with-refresh outranks an api_key when both exist unfiltered — a fresh
 * device-code login is the credential the user just connected.
 *
 * Testable without the dataDir singleton.
 */
export function selectExportCredential(
  auth: Record<string, PiCred>,
  provider?: string,
  opts?: ExportOptions,
): ExportedCredential | null {
  for (const [p, c] of Object.entries(auth)) {
    if (provider && p !== provider) continue;
    if (c?.type === "oauth" && c.access && c.refresh) {
      return {
        provider: p,
        access: c.access,
        refresh: c.refresh,
        expires: c.expires,
        accountId: c.accountId,
        enterpriseUrl: c.enterpriseUrl,
      };
    }
  }
  for (const [p, c] of Object.entries(auth)) {
    if (provider && p !== provider) continue;
    if (c?.type !== "api_key" || !c.key) continue;
    if (opts?.servedProviders?.has(p)) continue;
    return { provider: p, kind: "api_key", key: c.key };
  }
  return null;
}

/**
 * Export the locally-held credential so the control plane can capture it into
 * the workspace's central store right after a connect. When `provider` is
 * given, exports EXACTLY that provider — connect-once capture is
 * provider-specific, so capturing a github-copilot connect must never grab a
 * different provider that happens to come first in auth.json (which would
 * leave Copilot un-persisted centrally and 404 every per-turn serve). Without a
 * provider, falls back to the first connected provider (OAuth first). Returns
 * null when the (requested) provider isn't connected — also the post-scrub
 * state for OAuth, so capture must run before scrub. An api_key entry has no
 * refresh to scrub and stays exportable after capture; the replayed capture
 * simply re-PUTs the same key.
 *
 * `excludeServed` is the serve HEALER's contract (an AUTOMATIC capture with no
 * user behind it): only export credentials that provably originate from a
 * local login. For api_key entries — byte-identical whether pasted locally or
 * serve-written — that proof is the served-providers manifest; see
 * `ExportOptions.servedProviders`. A user-initiated capture omits it: the
 * entry it exports was just written by the login flow.
 *
 * Reads the ACTING identity's file (HOU-976): the host forwards the acting-as
 * token on `/auth/export`, and a member's connect must capture the credential
 * THEY just connected. Exporting the team's instead would hand the gateway one
 * refresh-token family to store under two rows — two rotators for one family,
 * the HOU-950 failure mode.
 */
export function exportCredential(
  provider?: string,
  opts?: { excludeServed?: boolean },
): ExportedCredential | null {
  const scopeKey = currentCredentialScope().key;
  const selected = selectExportCredential(
    readAuthFile(authPathIn(config.dataDir, scopeKey)),
    provider,
    opts?.excludeServed
      ? {
          servedProviders: new Set(
            readServedProvidersAt(
              servedProvidersPathIn(config.dataDir, scopeKey),
            ),
          ),
        }
      : undefined,
  );
  // Azure's key is unusable without its per-resource endpoint, which lives in
  // its own file (ai/azure-openai.ts), not auth.json — export it alongside so
  // the capture stores a row every other runtime can actually use
  // (PRODUCT-1532).
  if (
    selected &&
    "kind" in selected &&
    selected.kind === "api_key" &&
    selected.provider === AZURE_OPENAI
  ) {
    const endpoint = azureBaseUrl();
    return endpoint ? { ...selected, enterpriseUrl: endpoint } : selected;
  }
  return selected;
}
