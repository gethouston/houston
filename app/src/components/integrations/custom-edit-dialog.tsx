import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from "@houston-ai/core";
import type { CustomIntegrationView } from "@houston-ai/engine-client";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useEditCustomIntegration } from "../../hooks/queries/use-edit-custom-integration";

export function CustomEditDialog({
  integration,
  agentId,
  onClose,
}: {
  integration: CustomIntegrationView;
  agentId?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation("integrations");
  const [name, setName] = useState(integration.name);
  const [website, setWebsite] = useState(integration.website ?? "");
  const id = useId();
  const save = useEditCustomIntegration(agentId);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("custom.edit.title")}</DialogTitle>
          <DialogDescription>{t("custom.edit.description")}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim() || save.isPending) return;
            save.mutate(
              {
                slug: integration.slug,
                name: name.trim(),
                website: website.trim(),
              },
              { onSuccess: onClose },
            );
          }}
        >
          <div className="space-y-2">
            <label htmlFor={`${id}-name`} className="text-sm">
              {t("custom.add.nameLabel")}
            </label>
            <Input
              id={`${id}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              disabled={save.isPending}
              className="text-base"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor={`${id}-website`} className="text-sm">
              {t("custom.edit.website")}
            </label>
            <Input
              id={`${id}-website`}
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              disabled={save.isPending}
              className="text-base"
              aria-describedby={`${id}-help`}
            />
            <p id={`${id}-help`} className="text-sm text-ink-muted">
              {t("custom.edit.websiteHelp")}
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={save.isPending}
              onClick={onClose}
            >
              {t("custom.delete.cancel")}
            </Button>
            <Button type="submit" disabled={!name.trim() || save.isPending}>
              {t(save.isPending ? "custom.edit.saving" : "custom.edit.save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
