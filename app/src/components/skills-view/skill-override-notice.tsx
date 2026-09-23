import { Button } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { ScopedSkillNotice } from "./scoped-skill-actions";

/**
 * The notice an AI Employee's own Skills section shows over a WORKSPACE skill:
 * which copy the editor below is really writing to, and — where the employee
 * keeps its own copy — the one way back onto the workspace version.
 *
 * Both readings matter before the user types: editing the workspace version
 * changes the skill for every employee, and editing a copy leaves the
 * workspace version untouched. It stands inside the editor rather than in the
 * header's menu because it answers a question the user has before touching
 * anything.
 */
export function SkillOverrideNotice({
  kind,
  onUseWorkspaceVersion,
  disabled,
}: {
  kind: ScopedSkillNotice;
  /** Present exactly when `kind` is "override". */
  onUseWorkspaceVersion?: () => void;
  /** Inert while either scoped act is already writing. */
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
