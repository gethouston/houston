import { claudeSecureStorageDirIn } from "../../auth/auth-file";
import {
  currentCredentialScope,
  isPersonalScope,
} from "../../session/acting-context";
import type { ClaudeToken } from "./backend-types";

export function assertAnthropicScopeCredential(
  token: ClaudeToken | undefined,
): void {
  if (token) return;
  if (!isPersonalScope(currentCredentialScope().key)) return;
  throw new Error(
    "No provider connected. Your Anthropic account is not connected to this space yet. Connect it to keep chatting on Claude.",
  );
}

export function anthropicCredentialStorageDir(
  dataDir: string | undefined,
): string | undefined {
  const { key } = currentCredentialScope();
  if (!isPersonalScope(key)) return undefined;
  if (!dataDir)
    throw new Error(
      "cannot isolate the Claude credential store for a personal scope: no data dir was given, and falling back to the pod-shared login dir would run this turn on the team credential",
    );
  return claudeSecureStorageDirIn(dataDir, key);
}
