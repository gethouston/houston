import { config } from "../config";
import { currentCredentialScope } from "../session/acting-context";
import { authPathIn, servedProvidersPathIn } from "./auth-file";

export const authPathFor = () =>
  authPathIn(config.dataDir, currentCredentialScope().key);
export const servedManifestPathFor = () =>
  servedProvidersPathIn(config.dataDir, currentCredentialScope().key);

export function serveModeOn(): boolean {
  return !!config.controlPlaneUrl && !!config.sandboxToken;
}

let anthropicServed: boolean | undefined;

export function anthropicServedHere(): boolean | undefined {
  return anthropicServed;
}

export function setAnthropicServedHere(served: boolean): void {
  anthropicServed = served;
}

export function resetAnthropicServedHereForTest(): void {
  anthropicServed = undefined;
}
