import { credentialSiblings } from "@houston/domain";
import type { CredentialStore, WorkspaceCredential } from "../ports";

/**
 * Fetch a workspace's stored credential for `provider`, falling back to a
 * credential-sibling's when the provider has none of its own.
 *
 * OpenCode Zen (`opencode`) and OpenCode Go (`opencode-go`) share one
 * opencode.ai key, so a turn on the gateway the user did NOT explicitly connect
 * still resolves the shared key. The returned credential is RELABELED to the
 * requested `provider` so every downstream consumer (the sandbox serve response,
 * the per-turn POST body) writes the runtime's auth.json entry under the id the
 * turn actually runs on — not the sibling it was borrowed from.
 *
 * Returns null only when neither the provider nor any sibling is connected.
 */
export async function resolveSharedCredential(
  store: Pick<CredentialStore, "get">,
  workspaceId: string,
  provider: string,
): Promise<WorkspaceCredential | null> {
  const direct = await store.get(workspaceId, provider);
  if (direct) return direct;
  for (const sibling of credentialSiblings(provider)) {
    const shared = await store.get(workspaceId, sibling);
    if (shared) return { ...shared, provider };
  }
  return null;
}
