import { Button } from "@houston-ai/core";
import { LayoutTemplate } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../hooks/use-capabilities";
import { isAgentManager, isMultiplayer } from "../../lib/org-roles";
import type { Agent } from "../../lib/types";
import { SaveAsTemplateDialog } from "./save-as-template-dialog";

/**
 * The "Save as template" manager action on an agent's General settings. Renders
 * only in multiplayer mode AND only for an agent-manager of this agent (matrix
 * v2); single-player / self-host and non-managers see nothing. Opens the
 * {@link SaveAsTemplateDialog}. The gateway enforces the same authority.
 */
export function SaveAsTemplateSection({ agent }: { agent: Agent }) {
  const { t } = useTranslation("teams");
  const { capabilities } = useCapabilities();
  const [open, setOpen] = useState(false);

  if (!isMultiplayer(capabilities) || !isAgentManager(capabilities, agent)) {
    return null;
  }

  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold">
        {t("templates.save.sectionTitle")}
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        {t("templates.save.sectionHelper")}
      </p>
      <Button
        variant="secondary"
        className="rounded-full"
        onClick={() => setOpen(true)}
      >
        <LayoutTemplate className="size-4" />
        {t("templates.save.button")}
      </Button>
      <SaveAsTemplateDialog agent={agent} open={open} onOpenChange={setOpen} />
    </section>
  );
}
