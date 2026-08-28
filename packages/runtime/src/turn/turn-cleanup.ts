import { rm } from "node:fs/promises";
import { releaseConversation } from "../session/bus";
import type { startClaimHeartbeat } from "./claim-heartbeat";
import type { makeTurnSandboxFetch } from "./turn-sandbox";

/** Release every per-turn resource even when an earlier cleanup step fails. */
export async function cleanupTurn(input: {
  root: string;
  scope: string;
  conversationId: string;
  heartbeat: ReturnType<typeof startClaimHeartbeat> | null;
  sandbox: ReturnType<typeof makeTurnSandboxFetch> | null;
  closeSse?: () => void;
}): Promise<void> {
  try {
    await input.sandbox?.dispose().catch((error: unknown) => {
      const detail =
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : typeof error;
      console.error(`[turn] sandbox dispose failed (${detail})`);
    });
  } finally {
    try {
      await input.heartbeat?.stop();
    } finally {
      releaseConversation(input.scope, input.conversationId);
      try {
        await rm(input.root, { recursive: true, force: true });
      } finally {
        input.closeSse?.();
      }
    }
  }
}
