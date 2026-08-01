/**
 * Pure, DOM/i18n-free logic for PER-USER AI accounts (HOU-976).
 *
 * In a TEAM space every turn runs on the AI account of the person who sent it —
 * there is no shared team AI account to resolve against, and no scope to
 * address on the wire. What is left for the client is honesty: reading WHICH
 * account the server says answered, so a surface can label it. The decisions
 * are gathered here so each is unit-tested without a React renderer
 * (`app/tests/credential-scope.test.ts`).
 *
 * ABSENCE IS THE OLD WORLD. Every per-scope wire field is optional and omitted
 * whenever the turn/request carried no acting identity — desktop, self-host, a
 * personal space, routines. Every helper below therefore treats "no scope
 * information" as "one account, nothing to disambiguate", which is exactly the
 * rendering that shipped before this feature.
 */

import type { CredentialScope } from "@houston-ai/engine-client";

/**
 * The per-scope credential context a provider error / status row may carry.
 * Structurally identical in `@houston-ai/chat` and `@houston-ai/engine-client`;
 * spelled locally so this module stays dependency-light and both shapes pass in.
 */
export interface CredentialContext {
  scope?: CredentialScope;
}

/**
 * The account a provider's models are offered on, or `null` when the deployment
 * never said. `null` means the picker labels the row exactly as it did before
 * this feature — one account, no qualifier.
 */
export function credentialScopeOf(
  row: CredentialContext | undefined,
): CredentialScope | null {
  return row?.scope === "personal" || row?.scope === "team" ? row.scope : null;
}

/**
 * The same read for a probed `ProviderStatus`, whose field is spelled
 * `credentialScope` rather than `scope`.
 *
 * It exists because every field of {@link CredentialContext} is optional, so a
 * status object passed to {@link credentialScopeOf} type-checks and silently
 * answers `null` forever. One named reader per shape is what makes that
 * impossible instead of merely unlikely.
 */
export function statusCredentialScope(
  status: { credentialScope?: CredentialScope } | undefined,
): CredentialScope | null {
  return credentialScopeOf({ scope: status?.credentialScope });
}
