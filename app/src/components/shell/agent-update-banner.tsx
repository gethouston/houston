import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Button,
} from "@houston-ai/core";
import { RefreshCw } from "lucide-react";
import { useAgentCatalogStore } from "../../stores/agent-catalog";

export function AgentUpdateBanner() {
  const { t } = useTranslation(["shell", "common"]);
  const updatedRepos = useAgentCatalogStore((s) => s.updatedRepos);
  const dismiss = useAgentCatalogStore((s) => s.dismissUpdates);

  if (updatedRepos.length === 0) return null;

  const names = updatedRepos.map((r) => r.split("/").pop() || r);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) dismiss();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="size-4" />
            {t("shell:agentUpdate.title")}
          </DialogTitle>
          <DialogDescription>
            {names.length === 1
              ? t("shell:agentUpdate.descriptionOne", { name: names[0] })
              : t("shell:agentUpdate.descriptionMany", {
                  names: names.join(", "),
                })}{" "}
            {t("shell:agentUpdate.descriptionSuffix")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 pt-2">
          <Button
            onClick={() => window.location.reload()}
            className="rounded-full flex-1"
          >
            {t("shell:agentUpdate.reloadNow")}
          </Button>
          <Button variant="outline" onClick={dismiss} className="rounded-full">
            {t("common:actions.later")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
