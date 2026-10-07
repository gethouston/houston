import type { ClaudeBackendDeps } from "./backend-types";
import { buildClaudeEnv } from "./claude-env";
import { assertAnthropicScopeCredential } from "./scope-guard";
import type { TurnAuth } from "./session-deps";

export function makeRefreshAuth(
  deps: Pick<ClaudeBackendDeps, "readToken" | "layout">,
): () => TurnAuth {
  // The subprocess env, rebuilt from a FRESH credential read on every call.
  // The session invokes this at the start of each prompt (PRODUCT-1355):
  // the SDK spawns one subprocess per `query()`, so per-turn env is the
  // seam that lets a session follow the gateway's token rotation instead of
  // 401ing forever on the token it was built with. Re-asserting the scope
  // guard keeps a personal turn whose token vanished a typed refusal, never
  // a silent fall-through onto the pod-shared (team) credential.
  return () => {
    const fresh = deps.readToken();
    assertAnthropicScopeCredential(fresh);
    return {
      env: buildClaudeEnv(fresh, {
        configDir: deps.layout.configDir,
        // A disposable turn supplies this directly. The long-lived layout
        // resolves it lazily inside the prompt's acting-context scope.
        credentialStorageDir: deps.layout.credentialStorageDir,
        homeDir: deps.layout.homeDir,
      }),
      accessDigest: fresh?.accessDigest,
    };
  };
}
