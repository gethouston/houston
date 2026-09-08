import { config } from "../config";
import { currentCredentialScope } from "../session/acting-context";
import { authPathIn, servedProvidersPathIn } from "./auth-file";

/**
 * Both paths resolve through the CURRENT acting identity (HOU-976): a member's
 * sync writes that member's file only. With no acting identity these are
 * `<dataDir>/auth.json` and `<dataDir>/served-providers.json` — unchanged.
 */
export const authPathFor = () =>
  authPathIn(config.dataDir, currentCredentialScope().key);
export const servedManifestPathFor = () =>
  servedProvidersPathIn(config.dataDir, currentCredentialScope().key);

/** True when the sandbox is wired to serve a central workspace credential. */
export function serveModeOn(): boolean {
  return !!config.controlPlaneUrl && !!config.sandboxToken;
}

/**
 * Whether this host serves anthropic centrally, as the last answering probe
 * said (`anthropicServedVerdict`): `false` behind a desktop/self-host host,
 * `true` on a gateway-fronted pod, `undefined` before any probe answered.
 * The anthropic login reads it to pick where its credential must live
 * (login.ts, PRODUCT-1644): where nothing ever serves anthropic back, the
 * shared login dir is the single holder, never a captured central row.
 */
let anthropicServed: boolean | undefined;

export function anthropicServedHere(): boolean | undefined {
  return anthropicServed;
}

/**
 * What the last answering probe taught the sync, recorded as the sweep reads
 * each verdict.
 */
export function setAnthropicServedHere(served: boolean): void {
  anthropicServed = served;
}

/** Test seam: forget what the probes taught. */
export function resetAnthropicServedHereForTest(): void {
  anthropicServed = undefined;
}
