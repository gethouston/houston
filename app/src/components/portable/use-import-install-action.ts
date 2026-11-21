import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toAgent } from "../../lib/agents-facade";
import { genericErrorDescription } from "../../lib/error-report";
import { showExpectedStateToast } from "../../lib/error-toast";
import type { KickoffPin } from "../../lib/kickoff-pin";
import { openAgentBoard } from "../../lib/open-agent";
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
  nameProblem: () => string | null;
  resolveKickoffPin: () => KickoffPin;
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
  const { t } = useTranslation(["portable", "agents"]);
  const addToast = useUIStore((s) => s.addToast);
  const adoptAgent = useAgentStore((s) => s.adopt);
  const [installing, setInstalling] = useState(false);
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
          reportNameTaken: () =>
            showExpectedStateToast(
              t("agents:toasts.nameConflict", { name: name.trim() }),
              t("agents:toasts.nameConflictDescription"),
            ),
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
