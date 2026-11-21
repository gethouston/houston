import {
  currentCredentialScope,
  isPersonalScope,
} from "../../session/acting-context";
import { type ProbeAnswer, spawnStatusProbe } from "./auth-cli";
import {
  type CredentialProbe,
  readCredentialCache,
  refreshAnthropicCredential,
} from "./credential-probe-cache";
import { claudeCredentialFileUsable } from "./credentials-file";
import { claudeCredentialsFile } from "./paths";

export {
  forgetAnthropicCredentialCacheForTest,
  refreshAnthropicCredential,
  resetAnthropicCredentialCache,
} from "./credential-probe-cache";
export {
  clearGhostClaudeCredential,
  logoutAnthropicCredential,
} from "./credential-removal";
export type { CredentialProbe, ProbeAnswer };

export function anthropicCredentialCached(): boolean {
  if (isPersonalScope(currentCredentialScope().key)) return false;
  if (claudeCredentialFileUsable(claudeCredentialsFile())) return true;
  return readCredentialCache() ?? false;
}

export async function anthropicCredentialSettled(
  probe: CredentialProbe = spawnStatusProbe,
): Promise<boolean | undefined> {
  if (isPersonalScope(currentCredentialScope().key)) return false;
  if (claudeCredentialFileUsable(claudeCredentialsFile())) return true;
  const known = readCredentialCache();
  if (known !== undefined) return known;
  await refreshAnthropicCredential(probe);
  return readCredentialCache();
}

export function primeAnthropicCredential(): void {
  void refreshAnthropicCredential();
}
