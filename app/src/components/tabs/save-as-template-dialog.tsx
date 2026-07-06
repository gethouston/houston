import {
  AsyncButton,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Textarea,
} from "@houston-ai/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useAgentConfig,
  useCreateTemplate,
  useInstructions,
  useSkills,
} from "../../hooks/queries";
import { useAgentSettings } from "../../hooks/queries/use-agent-settings";
import { useCapabilities } from "../../hooks/use-capabilities";
import { isMultiplayer } from "../../lib/org-roles";
import { tauriSkills } from "../../lib/tauri";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import {
  allowedToolkitsReady,
  assembleSpec,
  canSaveTemplate,
  summarizeSpec,
} from "./save-as-template-model";
import { CapturedSummary } from "./save-as-template-summary";

/**
 * Name + description + a plain-language "what this captures" summary, assembled
 * from the queries the manager is already viewing (instructions, skills, model
 * config, allowed apps). On submit it loads each skill's body, builds the
 * {@link assembleSpec} spec, and POSTs it. Errors surface via the `call()` path
 * (red toast + Report bug) behind the mutation and the skill loads. Gated to
 * agent-managers by {@link SaveAsTemplateSection}; the gateway re-enforces.
 */
export function SaveAsTemplateDialog({
  agent,
  open,
  onOpenChange,
}: {
  agent: Agent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("teams");
  const { capabilities } = useCapabilities();
  const multiplayer = isMultiplayer(capabilities);
  const path = open ? agent.folderPath : undefined;
  const { data: instructions } = useInstructions(path);
  const { data: skills } = useSkills(path);
  const { data: config } = useAgentConfig(path);
  const settings = useAgentSettings(agent.id, open && multiplayer);
  const createTemplate = useCreateTemplate();
  const addToast = useUIStore((s) => s.addToast);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  // In multiplayer the real ceiling must have loaded before we capture it: an
  // absent/errored settings fetch would read as null = ALL apps and silently
  // over-permission the template past the agent's restricted set.
  const ceilingReady = allowedToolkitsReady(
    multiplayer,
    settings.data !== undefined,
  );
  const allowedToolkits = settings.data?.allowedToolkits ?? null;
  const segments = summarizeSpec({
    instructions: instructions ?? "",
    skillCount: skills?.length ?? 0,
    provider: config?.provider,
    model: config?.model,
    allowedToolkits,
  });

  const close = () => {
    onOpenChange(false);
    setName("");
    setDescription("");
  };

  const handleSave = async () => {
    if (!canSaveTemplate(name) || !ceilingReady) return;
    try {
      const details = await Promise.all(
        (skills ?? []).map((s) => tauriSkills.load(agent.folderPath, s.name)),
      );
      const spec = assembleSpec({
        instructions: instructions ?? "",
        skills: details.map((d) => ({ name: d.name, content: d.content })),
        provider: config?.provider,
        model: config?.model,
        effort: config?.effort,
        allowedToolkits,
      });
      await createTemplate.mutateAsync({
        name: name.trim(),
        description: description.trim(),
        spec,
      });
      addToast({
        variant: "success",
        title: t("templates.save.toast.title"),
        description: t("templates.save.toast.body", { name: name.trim() }),
      });
      close();
    } catch {
      // A failing skill load or template create already surfaced the real
      // reason as a red toast + Report bug (the `call()` wrapper). Swallow here
      // so the dialog stays open with the user's draft intact.
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(true) : close())}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("templates.save.dialog.title")}</DialogTitle>
          <DialogDescription>
            {t("templates.save.dialog.subtitle", { name: agent.name })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="save-template-name"
              className="text-xs text-muted-foreground"
            >
              {t("templates.save.nameLabel")}
            </label>
            <Input
              id="save-template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("templates.save.namePlaceholder")}
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="save-template-description"
              className="text-xs text-muted-foreground"
            >
              {t("templates.save.descriptionLabel")}
            </label>
            <Textarea
              id="save-template-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("templates.save.descriptionPlaceholder")}
            />
          </div>

          <CapturedSummary segments={segments} loading={!ceilingReady} />
        </div>

        <DialogFooter>
          <Button variant="secondary" className="rounded-full" onClick={close}>
            {t("templates.save.cancel")}
          </Button>
          <AsyncButton
            className="rounded-full"
            disabled={!canSaveTemplate(name) || !ceilingReady}
            onClick={() => handleSave()}
          >
            {t("templates.save.submit")}
          </AsyncButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
