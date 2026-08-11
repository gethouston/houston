import type { FeedItem } from "@houston-ai/chat";
import { useEffect, useMemo } from "react";
import { logger } from "../../../lib/logger";
import { tauriAgent } from "../../../lib/tauri";
import {
  appendSetupSection,
  stripSetupSection,
} from "../tutorial-system-prompt";

/** The agent emits this once the email actually sent. */
const SETUP_END_RE = /\[\s*\\?TUTORIAL[_\s\\]+COMPLETED?\s*\]/i;

interface PrepareEmailSetupArgs {
  agentPath: string;
  emailToolkit: string;
  emailToolkitLabel: string;
}

/**
 * Remove the temporary onboarding directive from the agent's CLAUDE.md.
 * Idempotent. Resolves `true` when the file no longer carries the section
 * (including "never did"), `false` when the strip could not be performed —
 * the CALLER decides how loudly that surfaces (a directive that outlives the
 * tutorial keeps steering every later mission).
 */
export async function stripEmailMissionSetup(
  agentPath: string,
): Promise<boolean> {
  try {
    const current = await tauriAgent.readFile(agentPath, "CLAUDE.md");
    const stripped = stripSetupSection(current);
    if (stripped !== current) {
      await tauriAgent.writeFile(agentPath, "CLAUDE.md", stripped);
    }
    return true;
  } catch (error) {
    logger.warn(`[email-setup] could not strip setup section: ${error}`);
    return false;
  }
}

/** Removes the temporary onboarding directive when the email mission leaves. */
export function useEmailSetupCleanup(agentPath: string) {
  useEffect(() => {
    return () => {
      void stripEmailMissionSetup(agentPath);
    };
  }, [agentPath]);
}

/** Whether the agent's live feed contains the onboarding completion marker. */
export function useEmailSetupCompleted(feed: FeedItem[] | undefined): boolean {
  return useMemo(() => {
    for (let i = (feed?.length ?? 0) - 1; i >= 0; i--) {
      const item = feed?.[i];
      if (item?.feed_type !== "assistant_text") continue;
      if (typeof item.data === "string" && SETUP_END_RE.test(item.data)) {
        return true;
      }
    }
    return false;
  }, [feed]);
}

/** Adds the email-specific directive before the agent receives its first turn. */
export async function prepareEmailMissionSetup({
  agentPath,
  emailToolkit,
  emailToolkitLabel,
}: PrepareEmailSetupArgs) {
  const current = await tauriAgent.readFile(agentPath, "CLAUDE.md");
  const updated = appendSetupSection(current, {
    toolkit: emailToolkit,
    toolkitLabel: emailToolkitLabel,
    toMyself: true,
  });
  if (updated !== current) {
    await tauriAgent.writeFile(agentPath, "CLAUDE.md", updated);
  }
}
