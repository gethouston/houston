/**
 * RoutineScreenHeader — the routine screen's top row (PRODUCT-1208): Back to
 * the list, the routine's name with an in-place rename (the pencil swaps the
 * title for an input; Enter/blur commits, Escape cancels), the trigger
 * activation chip, and the Runs / Open chat actions.
 */

import { Button, Input } from "@houston-ai/core";
import type { Routine } from "@houston-ai/engine-client";
import { ArrowLeft, History, MessageCircle, Pencil } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../lib/types";
import { RoutineActivationChip } from "./routine-activation-chip";

interface Props {
  agent: Agent;
  routine: Routine;
  onBackToList: () => void;
  onOpenRuns: () => void;
  onOpenChat: () => void;
  /** Persist a new name (called only with a non-empty change). */
  onRename: (name: string) => void;
}

export function RoutineScreenHeader({
  agent,
  routine,
  onBackToList,
  onOpenRuns,
  onOpenChat,
  onRename,
}: Props) {
  const { t } = useTranslation("routines");
  // Null = viewing; a string = the rename draft being edited.
  const [nameDraft, setNameDraft] = useState<string | null>(null);

  const commitRename = () => {
    if (nameDraft === null) return;
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== routine.name) onRename(trimmed);
    setNameDraft(null);
  };

  return (
    <div className="shrink-0 px-4 pt-6 pb-5 md:px-8">
      {/* Phone: the actions wrap onto their own row under the title (indented
          past the back glyph); desktop keeps the single row. */}
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-2 md:flex-nowrap">
        <button
          type="button"
          onClick={onBackToList}
          aria-label={t("chat.back")}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-hover/50 hover:text-ink"
        >
          <ArrowLeft className="size-4" strokeWidth={1.75} />
        </button>
        {nameDraft === null ? (
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <h2 className="min-w-0 truncate text-lg font-medium text-ink">
              {routine.name}
            </h2>
            <button
              type="button"
              onClick={() => setNameDraft(routine.name)}
              aria-label={t("details.editName")}
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-hover/50 hover:text-ink"
            >
              <Pencil className="size-3.5" strokeWidth={1.75} />
            </button>
          </div>
        ) : (
          <Input
            // Focus lands in the input the user just asked for via the pencil.
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setNameDraft(null);
            }}
            aria-label={t("details.editName")}
            className="h-9 min-w-0 flex-1 text-lg font-medium"
          />
        )}
        <div className="flex w-full flex-wrap items-center gap-2 pl-9 md:w-auto md:flex-nowrap md:pl-0">
          {routine.trigger && (
            <RoutineActivationChip
              agentId={agent.id}
              routineId={routine.id}
              trigger={routine.trigger}
            />
          )}
          <Button variant="secondary" size="sm" onClick={onOpenRuns}>
            <History className="size-4" />
            {t("details.runsTitle")}
          </Button>
          <Button variant="secondary" size="sm" onClick={onOpenChat}>
            <MessageCircle className="size-4" />
            {t("details.openChat")}
          </Button>
        </div>
      </div>
    </div>
  );
}
