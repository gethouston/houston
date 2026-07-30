import { AsyncButton, Button, DialogFooter, Textarea } from "@houston-ai/core";
import { MessageCircle } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../lib/types";
import { AgentSelectList } from "./agent-select-list";

/**
 * The ready-state body of the global skill dialog: the full SKILL.md in a
 * monospace editor (the same treatment as the per-agent edit modal) over the
 * agent assignment list. Owns the draft state; mounted with a `key` per skill
 * so switching rows reseeds it. Save hands the parent the draft + whether the
 * content changed — the parent turns that into the write/delete fan-out.
 */
export function ManageSkillBody({
  initialContent,
  agents,
  assignedIds,
  onSave,
  onDeleteEverywhere,
  onCancel,
  onEditInChat,
}: {
  /** The canonical copy's full SKILL.md (frontmatter + body). */
  initialContent: string;
  agents: Agent[];
  /** Ids of the agents currently holding a copy. */
  assignedIds: ReadonlySet<string>;
  onSave: (draft: {
    content: string;
    contentDirty: boolean;
    afterIds: Set<string>;
  }) => Promise<void>;
  onDeleteEverywhere: () => void;
  onCancel: () => void;
  /** Open the skill's guided setup chat instead of editing raw markdown
   *  (HOU-791's primary edit path). Omit to hide the button. */
  onEditInChat?: () => void;
}) {
  const { t } = useTranslation(["skills", "common"]);
  const [content, setContent] = useState(initialContent);
  const [selected, setSelected] = useState<Set<string>>(new Set(assignedIds));

  const contentDirty = content !== initialContent;
  const assignmentDirty =
    selected.size !== assignedIds.size ||
    [...selected].some((id) => !assignedIds.has(id));
  const dirty = contentDirty || assignmentDirty;
  // Unassigning everyone IS deletion — that path goes through the explicit
  // Delete button, so an empty selection can't ride an innocuous-looking Save.
  const savable = dirty && selected.size > 0;

  return (
    <>
      <div className="flex min-w-0 flex-col gap-4">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          aria-label={t("skills:addDialog.scratch.bodyLabel")}
          placeholder={t("skills:detail.instructionsPlaceholder")}
          className="h-64 resize-none overflow-y-auto font-mono text-sm"
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">
            {t("skills:global.manage.agentsLabel")}
          </span>
          <AgentSelectList
            agents={agents}
            selected={selected}
            onToggle={(agent) =>
              setSelected((prev) => {
                const next = new Set(prev);
                if (next.has(agent.id)) next.delete(agent.id);
                else next.add(agent.id);
                return next;
              })
            }
          />
          {selected.size === 0 && (
            <p className="text-xs text-ink-muted">
              {t("skills:global.manage.keepOneAgent")}
            </p>
          )}
        </div>
      </div>
      <DialogFooter>
        <Button
          type="button"
          variant="ghost"
          className="mr-auto text-danger hover:text-danger"
          onClick={onDeleteEverywhere}
        >
          {t("common:actions.delete")}
        </Button>
        {onEditInChat && (
          <Button type="button" variant="outline" onClick={onEditInChat}>
            <MessageCircle className="size-4" />
            {t("skills:global.manage.editInChat")}
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("common:actions.cancel")}
        </Button>
        <AsyncButton
          type="button"
          disabled={!savable}
          onClick={() => onSave({ content, contentDirty, afterIds: selected })}
        >
          {t("skills:detail.saveChanges")}
        </AsyncButton>
      </DialogFooter>
    </>
  );
}
