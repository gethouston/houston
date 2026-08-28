import { rm } from "node:fs/promises";
import { releaseConversation } from "../session/bus";
import type { startClaimHeartbeat } from "./claim-heartbeat";
import type { TurnFilesystemPreparation } from "./turn-filesystem";
import type { makeTurnSandboxFetch } from "./turn-sandbox";

const HYDRATION_SETTLE_TIMEOUT_MS = 5_000;

async function hydrationIsQuiet(
  hydration: Pick<TurnFilesystemPreparation, "abortHydration" | "settled">,
  timeoutMs: number,
): Promise<boolean> {
  hydration.abortHydration();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<false>((resolve) => {
    timeout = setTimeout(() => resolve(false), timeoutMs);
    timeout.unref?.();
  });
  const quiet = await Promise.race([
    hydration.settled.then(() => true as const),
    expired,
  ]);
  if (timeout) clearTimeout(timeout);
  return quiet;
}

/** Release every per-turn resource even when an earlier cleanup step fails. */
export async function cleanupTurn(input: {
  root: string;
  scope: string;
  conversationId: string;
  heartbeat: ReturnType<typeof startClaimHeartbeat> | null;
  sandbox: ReturnType<typeof makeTurnSandboxFetch> | null;
  hydration?: Pick<TurnFilesystemPreparation, "abortHydration" | "settled">;
  hydrationSettleTimeoutMs?: number;
  removeRoot?: (root: string) => Promise<void>;
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
        const quiet = input.hydration
          ? await hydrationIsQuiet(
              input.hydration,
              input.hydrationSettleTimeoutMs ?? HYDRATION_SETTLE_TIMEOUT_MS,
            )
          : true;
        if (quiet) {
          const removeRoot =
            input.removeRoot ??
            ((root: string) => rm(root, { recursive: true, force: true }));
          await removeRoot(input.root);
        } else {
          console.error(
            `[turn] hydration cleanup timed out after ${input.hydrationSettleTimeoutMs ?? HYDRATION_SETTLE_TIMEOUT_MS}ms; leaving the turn root in place`,
          );
        }
      } finally {
        input.closeSse?.();
      }
    }
  }
}
