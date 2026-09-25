/**
 * The install press of "From a friend", bound to React: the effects the order
 * in `import-install-flow.ts` calls, plus the same-tick latch that makes a rage
 * burst one install. Split from the wizard's step machine so each file states
 * one thing.
 */

import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { genericErrorDescription } from "../../lib/error-report";
import type { KickoffPin } from "../../lib/kickoff-pin";
import { openAgentBoard } from "../../lib/open-agent";
import { toAgent } from "../../lib/tauri";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { installImportedAgent } from "./import-install";
import { runImportInstall } from "./import-install-flow";
import { createSingleFlight } from "./single-flight";
import type { ImportSelection } from "./use-import-package";

interface ImportInstallInput {
  packageId: string | null;
  workspaceName: string | null;
  name: string;
  color: string;
  selection: ImportSelection;
  /** Authored copy for whatever makes the typed name unusable, or null. */
  nameProblem: () => string | null;
  resolveKickoffPin: () => KickoffPin;
  /** Dismiss the sheet: the new agent's board is what the user lands on. */
  onInstalled: () => void;
}

export function useImportInstallAction({
  packageId,
  workspaceName,
  name,
  color,
  selection,
  nameProblem,
  resolveKickoffPin,
  onInstalled,
}: ImportInstallInput) {
  const { t } = useTranslation("portable");
  const addToast = useUIStore((s) => s.addToast);
  const adoptAgent = useAgentStore((s) => s.adopt);
  const [installing, setInstalling] = useState(false);
  // Held in a ref so the latch outlives every re-render and every change of
  // `install`'s dependencies: a burst of clicks must meet the SAME latch.
  const installOnce = useRef(createSingleFlight());

  const install = useCallback(
    () =>
      installOnce.current(() =>
        runImportInstall({
          args:
            packageId && workspaceName
              ? {
                  packageId,
                  workspaceName,
                  agentName: name.trim(),
                  agentColor: color,
                  include: {
                    skillSlugs: Array.from(selection.skillSlugs),
                    routineIds: Array.from(selection.routineIds),
                    learningIds: Array.from(selection.learningIds),
                  },
                }
              : null,
          nameProblem,
          resolveKickoffPin,
          install: installImportedAgent,
          // Reveal the agent NOW — the same optimistic contract as the
          // create-agent dialog (HOU-710). `adopt` marks the agent provisioning
          // (HOU-693): the sidebar shows it, chat parks sends behind the "being
          // created" card, and a readiness probe clears the mark.
          reveal: (installed) => {
            adoptAgent(toAgent(installed.agent));
            addToast({
              variant: "success",
              title: t("import.toasts.installedTitle"),
              description: t("import.toasts.installedDescription", {
                name: installed.agentName,
              }),
            });
            openAgentBoard(installed.agent.id);
            onInstalled();
          },
          reportNameProblem: (problem) =>
            addToast({ variant: "error", title: problem }),
          reportFailure: (err) =>
            addToast({
              variant: "error",
              title: t("import.errors.installFailed"),
              description: genericErrorDescription("import_install", err),
            }),
          setInstalling,
        }),
      ),
    [
      addToast,
      adoptAgent,
      color,
      name,
      nameProblem,
      onInstalled,
      packageId,
      resolveKickoffPin,
      selection,
      t,
      workspaceName,
    ],
  );

  return { installing, install };
}
