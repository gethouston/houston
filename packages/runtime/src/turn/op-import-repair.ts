import { join, posix } from "node:path";
import { safeSeedKey } from "@houston/host/src/routes/agent-seed";
import { fetchWithRetry } from "@houston/runtime-client/object-sync";
import { unzipSync } from "fflate";
import { loadFullConversation } from "../store/conversation-file";
import type { OpClaimTurn } from "./op-republish";
import type { TurnServerDeps } from "./server-types";
import type { TurnFilesystem } from "./turn-filesystem";
import { poolIdentity } from "./turn-store";

export async function repairImportedConversations(
  deps: Pick<TurnServerDeps, "poolStoreUrl" | "fetchImpl">,
  turn: OpClaimTurn,
  filesystem: TurnFilesystem,
  uploaded: readonly string[],
  options: { requireRoute?: boolean } = {},
): Promise<string[]> {
  const baseUrl = deps.poolStoreUrl ?? process.env.HOUSTON_POOL_STORE_URL;
  if (!baseUrl) return [];
  const { org, agent } = poolIdentity(turn.gcsPrefix);
  const root = `${baseUrl.replace(/\/+$/, "")}/v1/pod/transcripts/${encodeURIComponent(org)}/${encodeURIComponent(agent)}/conversations`;
  const conversationsRel = posix.join(filesystem.dataRel, "conversations");
  const diagnostics: string[] = [];
  for (const [encoded, cid] of importedConversations(
    conversationsRel,
    uploaded,
  )) {
    try {
      await filesystem.vfs.readBytes(
        posix.join(conversationsRel, `${encoded}.json`),
      );
      for (const key of await filesystem.vfs.list(
        posix.join(conversationsRel, `${encoded}.archive`),
      ))
        await filesystem.vfs.readBytes(key);
      const conversation = loadFullConversation(
        join(filesystem.dataDir, "conversations"),
        cid,
      );
      if (!conversation) {
        diagnostics.push(`transcript repair ${cid} skipped: file unreadable`);
        continue;
      }
      const fetchImpl = deps.fetchImpl ?? fetch;
      const response = await fetchWithRetry(
        (input, init) =>
          fetchImpl(input, { ...init, signal: AbortSignal.timeout(5_000) }),
        `${root}/${encodeURIComponent(cid)}/repair`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${turn.hostToken}`,
            "X-Houston-Claim-Token": turn.claim.token,
            "X-Houston-Claim-Boot": turn.claim.bootId,
            "X-Houston-Claim-Conversation": turn.conversationId,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(conversation),
        },
      );
      await response.body?.cancel();
      if (!response.ok && (response.status !== 404 || options.requireRoute))
        diagnostics.push(
          `transcript repair ${cid} rejected (${response.status})`,
        );
    } catch (error) {
      diagnostics.push(
        `transcript repair ${cid} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return diagnostics;
}

function importedConversations(
  conversationsRel: string,
  uploaded: readonly string[],
): Map<string, string> {
  const out = new Map<string, string>();
  const prefix = `${conversationsRel}/`;
  for (const rel of uploaded) {
    if (!rel.startsWith(prefix)) continue;
    const [name = "", segment] = rel.slice(prefix.length).split("/");
    const encoded =
      segment === undefined
        ? name.endsWith(".json") && name.slice(0, -".json".length)
        : name.endsWith(".archive") && name.slice(0, -".archive".length);
    if (!encoded) continue;
    try {
      out.set(encoded, decodeURIComponent(encoded));
    } catch {}
  }
  return out;
}

export function archiveConversationKeys(
  bodyBase64: string | undefined,
  workspaceRel: string,
): string[] {
  if (!bodyBase64) return [];
  const keys: string[] = [];
  try {
    unzipSync(new Uint8Array(Buffer.from(bodyBase64, "base64")), {
      filter: (file) => {
        const rel = safeSeedKey(file.name);
        if (rel?.startsWith(".houston/runtime/conversations/"))
          keys.push(posix.join(workspaceRel, rel));
        return false;
      },
    });
  } catch {
    return [];
  }
  return keys;
}
