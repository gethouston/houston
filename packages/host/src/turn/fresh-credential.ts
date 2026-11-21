import { isExpiring } from "../credentials/refresh";
import {
  CredentialGoneError,
  sharedCredentialRefresher,
} from "../credentials/refresh-coalescer";
import type { WorkspaceCredential } from "../ports";
import type { TurnDeps } from "./deps";

export async function freshCredential(
  deps: TurnDeps,
  wsId: string,
  provider: string,
): Promise<WorkspaceCredential | null> {
  const cred = await deps.credentials.get(wsId, provider);
  if (!cred) return null;
  if (!isExpiring(cred)) return cred;
  try {
    return await sharedCredentialRefresher.run({
      workspaceId: wsId,
      provider,
      load: () => deps.credentials.get(wsId, provider),
      persist: (c) => deps.credentials.put(c),
      doRefresh: deps.refresh,
    });
  } catch (err) {
    if (err instanceof CredentialGoneError) return null;
    throw err;
  }
}
