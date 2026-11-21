import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { LEGACY_SECRETS_FILE } from "./op-migrate-tree";
import type { OpRequest } from "./parse-op-request";
import { poolIdentity } from "./turn-store";

export interface CustodyMove {
  moved: number;
  complete: boolean;
}

export async function moveLegacySecrets(input: {
  storeRoot: string;
  op: Pick<OpRequest, "gcsPrefix" | "hostToken" | "claim">;
  fetchImpl?: typeof fetch;
}): Promise<CustodyMove> {
  const path = join(input.storeRoot, LEGACY_SECRETS_FILE);
  if (!existsSync(path)) return { moved: 0, complete: true };
  const [
    { FileCustomSecretStore, RemoteCustomSecretStore },
    { createCustomSecret, moveLegacyToCustody },
  ] = await Promise.all([
    import("@houston/host/src/integrations/custom/secrets"),
    import("@houston/host/src/integrations/custom/legacy-custody"),
  ]);
  const { org, agent } = poolIdentity(input.op.gcsPrefix);
  const baseUrl = new URL(input.op.claim.heartbeatUrl).origin;
  const fetchImpl = input.fetchImpl ?? fetch;
  const custody = new RemoteCustomSecretStore({
    baseUrl,
    orgSlug: org,
    agentSlug: agent,
    podToken: input.op.hostToken,
    fetchImpl,
    cacheTtlMs: 0,
  });
  const result = await moveLegacyToCustody(
    new FileCustomSecretStore(path).entries(),
    {
      get: (id) => custody.get(id),
      create: (id, value) =>
        createCustomSecret(
          fetchImpl,
          `${baseUrl}/v1/pod/custom-secrets/${encodeURIComponent(org)}/${encodeURIComponent(agent)}/${encodeURIComponent(id)}`,
          input.op.hostToken,
          id,
          value,
        ),
    },
  );
  if (result.complete) rmSync(path);
  return result;
}
