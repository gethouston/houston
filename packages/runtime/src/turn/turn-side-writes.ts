import type { ObjectStore } from "@houston/runtime-client/object-sync";
import { persistTurnClaudeFlags } from "./turn-claude-flags";
import type { TurnFilesystem } from "./turn-filesystem";
import { recordPooledTokenSpend } from "./turn-ledger";
import type { TurnOutcome } from "./turn-session-types";

export async function landTurnSideWrites(input: {
  store: ObjectStore;
  prefix: string;
  filesystem: TurnFilesystem;
  root: string;
  conversationId: string;
  userId: string | undefined;
  spend: TurnOutcome["spend"];
}): Promise<void> {
  const { store, prefix, filesystem, root, spend } = input;
  await Promise.all([
    persistTurnClaudeFlags({
      store,
      prefix,
      filesystem,
      root,
      conversationId: input.conversationId,
      userId: input.userId,
    }),
    spend &&
      recordPooledTokenSpend({
        store,
        prefix,
        dataRel: filesystem.dataRel,
        provider: spend.provider,
        usage: spend.usage,
        scratchDir: root,
      }),
  ]);
}
