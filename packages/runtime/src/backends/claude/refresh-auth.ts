import type { ClaudeBackendDeps } from "./backend-types";
import { buildClaudeEnv } from "./claude-env";
import { assertAnthropicScopeCredential } from "./scope-guard";

export function makeRefreshAuth(
  deps: Pick<ClaudeBackendDeps, "readToken" | "layout">,
) {
  return (promptTokens?: number) => {
    const fresh = deps.readToken();
    assertAnthropicScopeCredential(fresh);
    return {
      env: buildClaudeEnv(fresh, {
        configDir: deps.layout.configDir,
        credentialStorageDir: deps.layout.credentialStorageDir,
        homeDir: deps.layout.homeDir,
        promptTokens,
      }),
      accessDigest: fresh?.accessDigest,
    };
  };
}
