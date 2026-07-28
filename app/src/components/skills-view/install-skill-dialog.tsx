import {
  AsyncButton,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../lib/types";
import { AgentSelectList } from "./agent-select-list";

/** What the picker needs to know about the skill being added. */
export interface InstallSkillTarget {
  /** The slug the copy will land under (drives the already-has locks). */
  slug: string;
  /** Display name for the dialog title. */
  name: string;
}

/**
 * "Add to which agents?" — the picker between an install click (marketplace
 * OR Houston library) and the per-agent fan-out (HOU-792: skills are stored
 * ON agents, so a global install is N copies). Agents that already hold the
 * slug are locked out; everyone else starts selected — the global page's
 * default intent is "my agents", narrowed by unticking.
 */
export function InstallSkillDialog({
  target,
  agents,
  hasSkill,
  onConfirm,
  onCancel,
}: {
  /** The pending install; null keeps the dialog closed. */
  target: InstallSkillTarget | null;
  agents: Agent[];
  /** Whether this agent already holds the slug (locks its row). */
  hasSkill: (agent: Agent, slug: string) => boolean;
  onConfirm: (targets: Agent[]) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation(["skills", "common"]);
  const [unticked, setUnticked] = useState<Set<string>>(new Set());

  if (!target) return null;
  const lockedIds = new Set(
    agents.filter((a) => hasSkill(a, target.slug)).map((a) => a.id),
  );
  const targets = agents.filter(
    (a) => !lockedIds.has(a.id) && !unticked.has(a.id),
  );
  const selected = new Set(targets.map((a) => a.id));
  const close = (open: boolean) => {
    if (!open) {
      setUnticked(new Set());
      onCancel();
    }
  };

  return (
    <Dialog open onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="min-w-0">
          <DialogTitle className="truncate">
            {t("skills:global.install.title", { name: target.name })}
          </DialogTitle>
          <DialogDescription>
            {t("skills:global.install.description")}
          </DialogDescription>
        </DialogHeader>
        <AgentSelectList
          agents={agents}
          selected={selected}
          onToggle={(agent) =>
            setUnticked((prev) => {
              const next = new Set(prev);
              if (next.has(agent.id)) next.delete(agent.id);
              else next.add(agent.id);
              return next;
            })
          }
          lockedIds={lockedIds}
          lockedNote={t("skills:global.alreadyHasIt")}
        />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => close(false)}>
            {t("common:actions.cancel")}
          </Button>
          <AsyncButton
            type="button"
            disabled={targets.length === 0}
            onClick={async () => {
              await onConfirm(targets);
              setUnticked(new Set());
            }}
          >
            {t("skills:global.install.confirm", { count: targets.length })}
          </AsyncButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
