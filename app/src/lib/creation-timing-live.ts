/**
 * The app's one `CreationStopwatch` (HOU-867), wired to the real clock, the
 * conversation VM, PostHog, and the log. Call sites: the create dialog
 * (begin/markCreated/markRevealed/fail), the setup mission (bindConversation),
 * the provisioning store (markEngineReady), and the send paths
 * (markIntroDispatched).
 */

import { conversationScope } from "@houston/sdk";
import { conversationStore } from "@houston-ai/engine-client";
import { analytics } from "./analytics";
import { CreationStopwatch } from "./creation-timing";
import { isCoLocatedEngine } from "./engine";
import { logger } from "./logger";

type FeedLike = Array<{ feed_type: string }>;

function readFeed(scope: string): FeedLike {
  const vm = conversationStore.getSnapshot(scope) as
    | { feed?: FeedLike }
    | undefined;
  return vm?.feed ?? [];
}

export const creationTiming = new CreationStopwatch({
  now: () => performance.now(),
  emit: (payload) => {
    // Null phases (never reached) are dropped: the props whitelist carries
    // string | number | boolean only.
    const props: Partial<
      Record<
        "outcome" | "remote_engine" | `${string}_ms`,
        string | number | boolean
      >
    > = {};
    for (const [key, value] of Object.entries(payload)) {
      if (value !== null && value !== undefined) {
        props[key as keyof typeof props] = value as string | number | boolean;
      }
    }
    analytics.track("agent_creation_timing", props);
    logger.info(`[creation-timing] ${JSON.stringify(payload)}`);
  },
  log: (line) => logger.info(line),
  watchFeed: (agentPath, sessionKey, cb) => {
    const scope = conversationScope(agentPath, sessionKey);
    const off = conversationStore.subscribe(scope, () => cb(readFeed(scope)));
    // The store does not replay on subscribe — deliver the current feed once.
    cb(readFeed(scope));
    return off;
  },
  remoteEngine: () => !isCoLocatedEngine(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
});
