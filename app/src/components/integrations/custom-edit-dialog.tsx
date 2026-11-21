import type { CustomIntegrationView } from "@houston/engine-adapter";
import { FormDialog, Input } from "@houston-ai/core";
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

  const submit = () =>
    save({
      slug: integration.slug,
      name: name.trim(),
      website: website.trim(),
    });

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t("custom.edit.title")}
      description={t("custom.edit.description")}
      primary={{
        label: t("custom.edit.save"),
        onClick: submit,
        disabled: !name.trim(),
      }}
      labels={{ cancel: t("custom.delete.cancel") }}
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
          className="text-base"
          aria-describedby={`${id}-help`}
        />
        <p id={`${id}-help`} className="text-sm text-ink-muted">
          {t("custom.edit.websiteHelp")}
        </p>
      </div>
    </FormDialog>
  );
}
