import { rm } from "node:fs/promises";
import { releaseConversation } from "../session/bus";
import { sharedHandoffs } from "../session/tools/browser/live/registry";
import { sharedBrowserPool } from "../session/tools/browser/pool";
import type { startClaimHeartbeat } from "./claim-heartbeat";
import type {
  TurnFilesystem,
  TurnFilesystemPreparation,
} from "./turn-filesystem";
import type { makeTurnSandboxFetch } from "./turn-sandbox";

const HYDRATION_SETTLE_TIMEOUT_MS = 5_000;

type CleanedHydration = Pick<
  TurnFilesystemPreparation,
  "abortHydration" | "settled"
> & { filesystem?: Pick<TurnFilesystem, "abandonDeferred"> };

async function hydrationIsQuiet(
  hydration: CleanedHydration,
  timeoutMs: number,
): Promise<boolean> {
  // A turn that never prompted (refused, failed setup, shadow) still has its
  // deferred files downloading: stopping them is not a failure to report.
  hydration.filesystem?.abandonDeferred?.();
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

export async function saveTurnBrowser(
  root: string,
  conversationId: string,
): Promise<void> {
  sharedHandoffs.end(conversationId, "cancelled");
  await sharedBrowserPool.saveUnder(root);
}

async function closeTurnBrowser(
  root: string,
  conversationId: string,
): Promise<void> {
  sharedHandoffs.end(conversationId, "cancelled");
  await sharedBrowserPool.closeUnder(root);
}

/** Release every per-turn resource even when an earlier cleanup step fails. */
export async function cleanupTurn(input: {
  root: string;
  scope: string;
  conversationId: string;
  heartbeat: ReturnType<typeof startClaimHeartbeat> | null;
  sandbox: ReturnType<typeof makeTurnSandboxFetch> | null;
  hydration?: CleanedHydration;
  hydrationSettleTimeoutMs?: number;
  removeRoot?: (root: string) => Promise<void>;
  closeSse?: () => void;
  closeBrowser?: (root: string, conversationId: string) => Promise<void>;
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
        await (input.closeBrowser ?? closeTurnBrowser)(
          input.root,
          input.conversationId,
        );
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
