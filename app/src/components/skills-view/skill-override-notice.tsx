import { Button } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { ScopedSkillNotice } from "./scoped-skill-actions";

export function SkillOverrideNotice({
  kind,
  onUseWorkspaceVersion,
  disabled,
}: {
  kind: ScopedSkillNotice;
  onUseWorkspaceVersion?: () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation("skills");
  const copy =
    kind === "override"
      ? {
          title: t("global.scopedOverride.title"),
          description: t("global.scopedOverride.description"),
        }
      : {
          title: t("global.scopedWorkspace.title"),
          description: t("global.scopedWorkspace.description"),
        };

  return (
    <div className="ht-hairline flex flex-col gap-3 rounded-xl bg-card p-4 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-medium text-ink text-sm">{copy.title}</p>
        <p className="text-ink-muted text-xs">{copy.description}</p>
      </div>
      {onUseWorkspaceVersion && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 rounded-full"
          disabled={disabled}
          onClick={onUseWorkspaceVersion}
        >
          {t("global.manage.revert")}
        </Button>
      )}
    </div>
  );
}
