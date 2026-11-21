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
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { skillDisplayTitle } from "../../lib/humanize-skill-name";
import { BackControl } from "../shell/back-control";
import { HEADER_HEIGHT_DESKTOP } from "../shell/page-header/page-header-layout";
import { SkillIcon } from "../skill-icon";
import type { SkillEditorView } from "./skill-editor-model";
import type { ManagedSkillRow } from "./skill-editor-props";

export interface SkillEditorHeaderProps {
  row: ManagedSkillRow;
  rename: string | null;
  onRename?: (title: string) => void;
  view: SkillEditorView;
  onViewChange: (view: SkillEditorView) => void;
  onBack: () => void;
  onOpenChat?: () => void;
  workspaceItems?: ReactNode;
  onDelete: () => void;
  deleteLabel?: string;
  deleteDisabled?: boolean;
}

export function SkillEditorHeader({
  row,
  rename,
  onRename,
  view,
  onViewChange,
  onBack,
  onOpenChat,
  workspaceItems,
  onDelete,
  deleteLabel,
  deleteDisabled,
}: SkillEditorHeaderProps) {
  const { t } = useTranslation(["skills", "common"]);

  return (
    <div
      className={cn(
        "mb-2 flex shrink-0 flex-col gap-3 pt-3 pb-3 md:flex-row md:items-center md:gap-4 md:py-0",
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
            level={2}
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
            {workspaceItems}
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
