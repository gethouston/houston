/**
 * The "From a friend" flow: which steps exist and the arriving agent's
 * identity. The install press itself is `use-import-install-action.ts`.
 *
 * The step list is derived from the package, so one with no routines has no
 * routines step at all rather than an empty one.
 *
 * `reset()` deliberately leaves provider and model alone: they rehydrate from
 * the sticky last-used pair on the next open, and clearing them first would
 * flash the hardcoded fallback in the selector.
 */

import { AGENT_COLORS } from "@houston-ai/core";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AGENT_NAME_MAX_LENGTH, agentNameIssue } from "../../lib/agent-name";
import { genericErrorDescription } from "../../lib/error-report";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import { useImportInstallAction } from "./use-import-install-action";
import { useImportPackage } from "./use-import-package";
import { useImportProviderModel } from "./use-import-provider-model";

export type StepId = "upload" | "name" | "skills" | "routines" | "learnings";
export type PickStepId = Extract<StepId, "skills" | "routines" | "learnings">;

export function useImportWizard() {
  const { t } = useTranslation(["portable", "agents"]);
  const open = useUIStore((s) => s.importFromFriendOpen);
  const setOpen = useUIStore((s) => s.setImportFromFriendOpen);
  const addToast = useUIStore((s) => s.addToast);
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const existingAgents = useAgentStore((s) => s.agents);

  const [stepIndex, setStepIndex] = useState(0);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(AGENT_COLORS[0].id);
  const providerModel = useImportProviderModel(open);

  const pkg = useImportPackage({
    // The friend's name for the agent is only a suggestion: a name the user has
    // already typed wins.
    onPreview: useCallback((preview) => {
      setName((prev) =>
        !prev && preview.manifest.agentName ? preview.manifest.agentName : prev,
      );
    }, []),
    onError: useCallback(
      (err: unknown) => {
        addToast({
          variant: "error",
          title: t("import.errors.uploadFailed"),
          description: genericErrorDescription("import_upload", err),
        });
      },
      [addToast, t],
    ),
  });

  const { uploaded, selection } = pkg;

  const steps = useMemo<StepId[]>(() => {
    const out: StepId[] = ["upload", "name"];
    if (!uploaded) return out;
    if (uploaded.preview.skills.length > 0) out.push("skills");
    if (uploaded.preview.routines.length > 0) out.push("routines");
    if (uploaded.preview.learnings.length > 0) out.push("learnings");
    return out;
  }, [uploaded]);

  const currentStep = steps[stepIndex] ?? "upload";

  const reset = useCallback(() => {
    setStepIndex(0);
    setName("");
    setColor(AGENT_COLORS[0].id);
    pkg.resetPackage();
    providerModel.resetPreference();
  }, [pkg.resetPackage, providerModel.resetPreference]);

  const close = useCallback(() => {
    setOpen(false);
    reset();
  }, [reset, setOpen]);

  // Same pre-submit rule as the create dialog (HOU-1166): reject bad shapes and
  // duplicates with friendly copy before the install round-trip.
  const nameProblem = useCallback((): string | null => {
    if (!name.trim()) return t("import.errors.nameRequired");
    const issue = agentNameIssue(
      name,
      existingAgents.map((a) => a.name),
    );
    if (!issue) return null;
    if (issue === "taken")
      return t("agents:toasts.nameConflict", { name: name.trim() });
    if (issue === "tooLong")
      return t("agents:nameErrors.tooLong", { max: AGENT_NAME_MAX_LENGTH });
    return t("agents:nameErrors.invalidChars");
  }, [existingAgents, name, t]);

  const { installing, install } = useImportInstallAction({
    packageId: uploaded?.packageId ?? null,
    workspaceName: currentWorkspace?.name ?? null,
    name,
    color,
    selection,
    nameProblem,
    resolveKickoffPin: providerModel.resolveKickoffPin,
    onInstalled: close,
  });

  const canAdvance =
    currentStep === "upload"
      ? !!uploaded && pkg.wantScan !== null && !pkg.scanning
      : currentStep === "name"
        ? name.trim().length > 0
        : true;

  return {
    open,
    close,
    stepIndex,
    stepCount: steps.length,
    currentStep,
    isLast: stepIndex === steps.length - 1,
    canAdvance,
    goBack: () => setStepIndex((i) => Math.max(0, i - 1)),
    goNext: () => setStepIndex((i) => i + 1),
    name,
    setName,
    color,
    setColor,
    installing,
    install,
    providerModel,
    pkg,
  };
}
