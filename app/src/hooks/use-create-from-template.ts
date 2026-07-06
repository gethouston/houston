import type { TemplateSummary } from "@houston-ai/engine-client";
import { useCallback, useEffect, useState } from "react";
import { isMultiplayer } from "../lib/org-roles";
import { useAgentStore } from "../stores/agents";
import { useWorkspaceStore } from "../stores/workspaces";
import { useOrgTemplates } from "./queries/use-org-templates";
import { useCanCreateAgents } from "./use-can-create-agents";
import { useCapabilities } from "./use-capabilities";

/**
 * "Create from template" wiring for the new-agent dialog (Teams v2). Fetches the
 * org's templates and stamps a new agent from the chosen one.
 *
 * Gated to a multiplayer host + a caller who may create agents + the dialog
 * being open: on single-player/self-host (or for a plain member) the query
 * stays disabled and `templates` is `[]`, so the picker section never renders
 * and the create flow is byte-identical to today.
 *
 * The new agent takes the template's name; the gateway applies the template's
 * instructions, skills, model, and allowed apps in the background (the agent
 * list reacts to `AgentsChanged` when that lands), so there is deliberately NO
 * local provider/model write here — that would fight the template's own model.
 */
export function useCreateFromTemplate(opts: {
  /** Whether the new-agent dialog is open (gates the query + resets state). */
  open: boolean;
  /** Called after the agent is created, to reveal it and close the dialog. */
  onCreated: () => void;
}): {
  templates: TemplateSummary[];
  creatingTemplateId: string | null;
  createFromTemplate: (templateId: string) => Promise<void>;
} {
  const { open, onCreated } = opts;
  const { capabilities } = useCapabilities();
  const { canCreate } = useCanCreateAgents();
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const createAgent = useAgentStore((s) => s.create);
  const [creatingTemplateId, setCreatingTemplateId] = useState<string | null>(
    null,
  );

  const enabled = open && isMultiplayer(capabilities) && canCreate;
  const { data: templates = [] } = useOrgTemplates(enabled);

  // Clear the in-flight card state whenever the dialog closes.
  useEffect(() => {
    if (!open) setCreatingTemplateId(null);
  }, [open]);

  const createFromTemplate = useCallback(
    async (templateId: string) => {
      const tpl = templates.find((x) => x.id === templateId);
      if (creatingTemplateId || !tpl || !currentWorkspace) return;
      setCreatingTemplateId(templateId);
      try {
        await createAgent(
          currentWorkspace.id,
          tpl.name,
          "blank",
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          templateId,
        );
      } catch {
        // createAgent routes through the tauri `call()` wrapper, which already
        // surfaced the real error as a toast + Sentry report. Just clear the
        // in-flight state so the card is clickable again.
        setCreatingTemplateId(null);
        return;
      }
      onCreated();
    },
    [templates, creatingTemplateId, currentWorkspace, createAgent, onCreated],
  );

  return { templates, creatingTemplateId, createFromTemplate };
}
