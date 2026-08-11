import { useState } from "react";
import { useTranslation } from "react-i18next";
import { analytics } from "../../lib/analytics";
import { logger } from "../../lib/logger";
import { tauriAgent } from "../../lib/tauri";
import { useAgentStore } from "../../stores/agents";
import { newConversationDraftKey, useDraftStore } from "../../stores/drafts";
import { useUIStore } from "../../stores/ui";
import { missionControlDraftScope } from "../board/mission-control-scope";
import { prepareEmailMissionSetup } from "./missions/email-mission-setup";
import { stripSetupSection } from "./tutorial-system-prompt";

/**
 * The guided email first task: the tutorial PREWRITES the agent's first
 * mission ("Send me a hello email") into the new-conversation composer draft
 * (locked by `use-board-drafts.ts` while the tutorial runs) and primes the
 * agent with the legacy email-mission directive (a temporary CLAUDE.md
 * section: send ONE real email to the user's own address, then emit the
 * completion marker `use-in-app-onboarding.ts` watches for).
 *
 * Arms only when the tutorial created the agent AND an email toolkit is
 * connected; otherwise the send step stays the free-text variant. Every
 * terminal path calls {@link cleanup} so neither the draft nor the CLAUDE.md
 * section outlives the tutorial.
 */
export function useGuidedEmailTask() {
  const { t } = useTranslation("setup");
  const addToast = useUIStore((s) => s.addToast);
  const [agentPath, setAgentPath] = useState<string | null>(null);
  const [toolkit, setToolkit] = useState<{
    toolkit: string;
    label: string;
  } | null>(null);

  // Both keys the board's composer may read the new-conversation draft from:
  // the active team's scope and the unscoped fallback.
  const draftKeys = () => {
    const teamId = useUIStore.getState().activeTeamId;
    return [
      ...new Set([
        newConversationDraftKey(missionControlDraftScope(teamId ?? undefined)),
        newConversationDraftKey(missionControlDraftScope(undefined)),
      ]),
    ];
  };
  const writeDrafts = (text: string) => {
    const drafts = useDraftStore.getState();
    for (const key of draftKeys()) drafts.setDraftText(key, text);
  };
  const setLock = (locked: boolean) =>
    useUIStore.getState().setTutorialComposerLock(locked);

  const stripDirective = (path: string) => {
    void (async () => {
      try {
        const current = await tauriAgent.readFile(path, "CLAUDE.md");
        const stripped = stripSetupSection(current);
        if (stripped !== current) {
          await tauriAgent.writeFile(path, "CLAUDE.md", stripped);
        }
      } catch (error) {
        logger.warn(`[in-app-onboarding] setup-section strip failed: ${error}`);
      }
    })();
  };

  return {
    /** The email variant is live for the send step. */
    armed: toolkit !== null,
    /** Call at the agent-created celebration: the store's current agent IS
     *  the one the dialog just adopted. */
    captureCreatedAgent: () => {
      const created = useAgentStore.getState().current;
      if (created) setAgentPath(created.folderPath);
    },
    /** Call on entering the send step. No toolkit or no tutorial-created
     *  agent → stays unarmed (free-text variant). A failed priming write
     *  reverts to unarmed with a visible toast — never a silent divergence
     *  between what the chip promises and what the agent was told. */
    arm: (args: {
      toolkit: { toolkit: string; label: string } | null;
      draftText: string;
    }) => {
      if (!agentPath || !args.toolkit) {
        setToolkit(null);
        return;
      }
      const picked = args.toolkit;
      setToolkit(picked);
      setLock(true);
      writeDrafts(args.draftText);
      void prepareEmailMissionSetup({
        agentPath,
        emailToolkit: picked.toolkit,
        emailToolkitLabel: picked.label,
      }).catch((error) => {
        setToolkit(null);
        setLock(false);
        writeDrafts("");
        addToast({
          title: t("tutorial.errors.setupFailed"),
          description: String(error),
          variant: "error",
        });
      });
    },
    /** The agent confirmed the send: funnel event + teardown. */
    completed: () => {
      if (toolkit)
        analytics.track("first_email_sent", { provider: toolkit.toolkit });
      setLock(false);
      writeDrafts("");
      if (agentPath) stripDirective(agentPath);
    },
    /** Terminal teardown for every exit path (finish, escape hatch). */
    cleanup: () => {
      setLock(false);
      if (toolkit) writeDrafts("");
      if (agentPath) stripDirective(agentPath);
    },
  };
}
