import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@houston-ai/core";
import { EditableSkillTitle } from "@houston-ai/skills";
import { MessageCircle, MoreHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { logAndReportError } from "../../lib/error-report";
import { skillDisplayTitle } from "../../lib/humanize-skill-name";
import { BackControl } from "../shell/back-control";
import { HEADER_HEIGHT_DESKTOP } from "../shell/page-header/page-header-layout";
import { SkillIcon } from "../skill-icon";
import type { SkillEditorView } from "./skill-editor-model";
import type { ManagedSkillRow } from "./skill-editor-props";
import type { SkillsFrame } from "./skills-surface-frame";

export interface SkillEditorHeaderProps {
  row: ManagedSkillRow;
  /** The frame the editor stands in: a page strip, or a section's own header
   *  inside the settings rail's column, which already carries the gutter. */
  frame: SkillsFrame;
  /** The pending rename, or null when the name is the stored one. */
  rename: string | null;
  /** Commit a rename into the draft. Omit while the skill is still loading. */
  onRename?: (title: string) => void;
  view: SkillEditorView;
  onViewChange: (view: SkillEditorView) => void;
  onBack: () => void;
  /** Reopen the skill's chat; omitted when it is already on the glass. */
  onOpenChat?: () => void;
  /** "Share to workspace" — local rows on a shared-store deployment. */
  onPromote?: () => Promise<void>;
  /** "Enable for all agents" — shared rows not yet on every agent. */
  onEnableAll?: () => Promise<void>;
  onDelete: () => void;
  /** Overrides the danger item's label — an employee's own section stops
   *  LOADING a workspace skill rather than deleting everyone's copy. */
  deleteLabel?: string;
  /** Inert while the act the item starts is already writing. */
  deleteDisabled?: boolean;
}

/**
 * The skill editor's own page header, in place of the library's: back to the
 * list, the skill's identity (icon, renameable name, description), and the
 * controls that act on the whole skill — the Workflow / Text switch, the way
 * back into the chat once it has been closed, and the rarer whole-skill
 * actions behind one menu.
 *
 * It stands on the SAME strip geometry as the library list's header — 48px
 * tall on the desktop, the same left edge at every width — because the editor
 * replaces the list in place: a taller header here would shove the body down
 * on every skill opened. That is also why the description rides beside the
 * name rather than under it.
 *
 * The phone stacks identity over controls and gives the switch the full width;
 * the desktop runs both on one line.
 */
export function SkillEditorHeader({
  row,
  frame,
  rename,
  onRename,
  view,
  onViewChange,
  onBack,
  onOpenChat,
  onPromote,
  onEnableAll,
  onDelete,
  deleteLabel,
  deleteDisabled,
}: SkillEditorHeaderProps) {
  const { t } = useTranslation(["skills", "common"]);

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col gap-3 pt-3 pb-3 md:flex-row md:items-center md:gap-4 md:py-0",
        frame === "screen" ? "px-5" : "mb-2",
        HEADER_HEIGHT_DESKTOP,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <BackControl
          size="compact"
          label={t("skills:editor.back")}
          onClick={onBack}
        />
        <SkillIcon
          image={row.summary.image}
          bubbleClassName="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-line-input"
        />
        <div className="flex min-w-0 flex-col md:flex-row md:items-baseline md:gap-2">
          <EditableSkillTitle
            title={rename ?? skillDisplayTitle(row.summary)}
            onRename={onRename}
            renameLabel={t("skills:detail.rename")}
            // The settings rail's section lozenge is already the screen's h1.
            level={frame === "inline" ? 2 : 1}
          />
          {row.summary.description && (
            <p className="min-w-0 truncate text-ink-muted text-sm">
              {row.summary.description}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Tabs
          value={view}
          onValueChange={(next) => onViewChange(next as SkillEditorView)}
          className="min-w-0 flex-1 md:flex-none"
        >
          <TabsList
            aria-label={t("skills:editor.viewLabel")}
            className="w-full rounded-full md:w-auto"
          >
            <TabsTrigger value="workflow" className="rounded-full">
              {t("skills:editor.workflowView")}
            </TabsTrigger>
            <TabsTrigger value="text" className="rounded-full">
              {t("skills:editor.textView")}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {onOpenChat && (
          <Button
            type="button"
            variant="outline"
            className="shrink-0 rounded-full"
            onClick={onOpenChat}
          >
            <MessageCircle className="size-4" />
            {t("skills:editor.openChat")}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 rounded-full"
              aria-label={t("skills:editor.menuLabel")}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {/* The store writes behind these already toast their real reason
                through `call`; reporting keeps the rejection from being silent
                to US as well — a log alone reaches no reporting path. */}
            {onPromote && (
              <DropdownMenuItem
                onSelect={() => {
                  void onPromote().catch((err: unknown) =>
                    logAndReportError("skill_share_to_workspace", err),
                  );
                }}
              >
                {t("skills:global.manage.shareToWorkspace")}
              </DropdownMenuItem>
            )}
            {onEnableAll && (
              <DropdownMenuItem
                onSelect={() => {
                  void onEnableAll().catch((err: unknown) =>
                    logAndReportError("skill_enable_for_all", err),
                  );
                }}
              >
                {t("skills:global.manage.enableAll")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              variant="destructive"
              disabled={deleteDisabled}
              onSelect={onDelete}
            >
              {deleteLabel ?? t("common:actions.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
