import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { analytics } from "../../lib/analytics";
import { useAgentStore } from "../../stores/agents";
import { newConversationDraftKey, useDraftStore } from "../../stores/drafts";
import { useUIStore } from "../../stores/ui";
import { missionControlDraftScope } from "../board/mission-control-scope";
import {
  prepareEmailMissionSetup,
  stripEmailMissionSetup,
} from "./missions/email-mission-setup";

/**
 * The guided email first task: the tutorial PREWRITES the agent's first
 * mission ("Send me a hello email") into the new-conversation composer draft
 * (locked by `use-board-drafts.ts` via `tutorialComposerLock`) and primes the
 * agent with the legacy email-mission directive (a temporary CLAUDE.md
 * section: send ONE real email to the user's own address, then emit the
 * completion marker the flow watches for).
 *
 * `armed` flips true only once the priming WRITE has landed — a send that
 * beats it degrades to the plain first-task finale instead of waiting for a
 * marker the agent was never told to emit. The lock and draft are released
 * the moment the send happens ({@link onSent}); the directive is stripped on
 * completion, on every terminal path, and on unmount, with a visible toast
 * when a strip fails (a directive that outlives the tutorial keeps steering
 * later missions).
 */
export function useGuidedEmailTask() {
  const { t } = useTranslation("setup");
  const addToast = useUIStore((s) => s.addToast);
  const [agentPath, setAgentPath] = useState<string | null>(null);
  const [status, setStatus] = useState<"unarmed" | "arming" | "armed">(
    "unarmed",
  );
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
  const releaseComposer = () => {
    setLock(false);
    writeDrafts("");
  };

  const strip = (path: string) => {
    void stripEmailMissionSetup(path).then((ok) => {
      if (ok) return;
      addToast({
        title: t("tutorial.errors.setupFailed"),
        description: t("inApp.stripFailed"),
        variant: "error",
      });
    });
  };

  // Unmount is a terminal path too (the overlay can go away with the section
  // still applied — e.g. an abnormal dismissal): never leave it behind.
  const liveRef = useRef({ agentPath, armedOrArming: status !== "unarmed" });
  liveRef.current = { agentPath, armedOrArming: status !== "unarmed" };
  // biome-ignore lint/correctness/useExhaustiveDependencies: unmount-only cleanup reading the latest state through a ref.
  useEffect(() => {
    return () => {
      const live = liveRef.current;
      setLock(false);
      if (live.agentPath && live.armedOrArming) {
        void stripEmailMissionSetup(live.agentPath);
      }
    };
  }, []);

  return {
    /** The email variant is live: the priming write LANDED. */
    armed: status === "armed",
    /** The tutorial-created agent's path (null when creation was skipped). */
    agentPath,
    /** Call at the agent-created celebration: the store's current agent IS
     *  the one the dialog just adopted. */
    captureCreatedAgent: () => {
      const created = useAgentStore.getState().current;
      if (created) setAgentPath(created.folderPath);
    },
    /** Call on entering the send step. No toolkit or no tutorial-created
     *  agent → stays unarmed (free-text variant). The draft prefills and
     *  locks immediately; `armed` waits for the CLAUDE.md write, and a
     *  failed write reverts everything with a visible toast. */
    arm: (args: {
      toolkit: { toolkit: string; label: string } | null;
      draftText: string;
    }) => {
      if (!agentPath || !args.toolkit) {
        setStatus("unarmed");
        setToolkit(null);
        return;
      }
      const picked = args.toolkit;
      const path = agentPath;
      setToolkit(picked);
      setStatus("arming");
      setLock(true);
      writeDrafts(args.draftText);
      void prepareEmailMissionSetup({
        agentPath: path,
        emailToolkit: picked.toolkit,
        emailToolkitLabel: picked.label,
      })
        .then(() => setStatus("armed"))
        .catch((error) => {
          setStatus("unarmed");
          setToolkit(null);
          releaseComposer();
          addToast({
            title: t("tutorial.errors.setupFailed"),
            description: String(error),
            variant: "error",
          });
        });
    },
    /** The send happened (either finale path): the composer is the user's
     *  again — the lock's whole job is over. */
    onSent: releaseComposer,
    /** The agent confirmed the send: funnel event + directive teardown. */
    completed: () => {
      if (toolkit)
        analytics.track("first_email_sent", { provider: toolkit.toolkit });
      releaseComposer();
      if (agentPath) strip(agentPath);
      setStatus("unarmed");
    },
    /** Terminal teardown for every exit path. */
    cleanup: () => {
      releaseComposer();
      if (agentPath && status !== "unarmed") strip(agentPath);
      setStatus("unarmed");
    },
  };
}
