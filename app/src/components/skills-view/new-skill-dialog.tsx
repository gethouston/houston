import {
  AsyncButton,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Textarea,
} from "@houston-ai/core";
import { toSlug } from "@houston-ai/skills";
import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../lib/types";
import { AgentSelectList } from "./agent-select-list";

/**
 * The global "New skill" dialog (HOU-792): the from-scratch fields the
 * per-agent Add dialog carries (title, one-liner, instructions — same i18n
 * keys) PLUS the agent multi-select, because a skill created from the global
 * page is written to every picked agent. Agents already holding the derived
 * slug lock out live as the user types the title.
 */
export function NewSkillDialog({
  open,
  onOpenChange,
  agents,
  hasSkill,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: Agent[];
  hasSkill: (agent: Agent, slug: string) => boolean;
  onCreate: (
    input: { name: string; description: string; content: string },
    targets: Agent[],
  ) => Promise<void>;
}) {
  const { t } = useTranslation(["skills", "common"]);
  const fieldId = useId();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");
  const [unticked, setUnticked] = useState<Set<string>>(new Set());

  const slug = useMemo(() => toSlug(title), [title]);
  const lockedIds = useMemo(
    () =>
      new Set(
        slug ? agents.filter((a) => hasSkill(a, slug)).map((a) => a.id) : [],
      ),
    [agents, hasSkill, slug],
  );
  const targets = agents.filter(
    (a) => !lockedIds.has(a.id) && !unticked.has(a.id),
  );
  const ready =
    title.trim() !== "" &&
    slug !== "" &&
    description.trim() !== "" &&
    body.trim() !== "" &&
    targets.length > 0;

  const reset = () => {
    setTitle("");
    setDescription("");
    setBody("");
    setUnticked(new Set());
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader className="min-w-0">
          <DialogTitle>{t("skills:global.create.title")}</DialogTitle>
          <DialogDescription>
            {t("skills:global.create.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${fieldId}-title`}
              className="text-sm font-medium text-ink"
            >
              {t("skills:addDialog.scratch.titleLabel")}
            </label>
            <Input
              id={`${fieldId}-title`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("skills:addDialog.scratch.titlePlaceholder")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${fieldId}-description`}
              className="text-sm font-medium text-ink"
            >
              {t("skills:addDialog.scratch.descriptionLabel")}
            </label>
            <Input
              id={`${fieldId}-description`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("skills:addDialog.scratch.descriptionPlaceholder")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${fieldId}-body`}
              className="text-sm font-medium text-ink"
            >
              {t("skills:addDialog.scratch.bodyLabel")}
            </label>
            <Textarea
              id={`${fieldId}-body`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t("skills:addDialog.scratch.bodyPlaceholder")}
              className="h-32 resize-none overflow-y-auto font-mono text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">
              {t("skills:global.create.agentsLabel")}
            </span>
            <AgentSelectList
              agents={agents}
              selected={new Set(targets.map((a) => a.id))}
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
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
          >
            {t("common:actions.cancel")}
          </Button>
          <AsyncButton
            type="button"
            disabled={!ready}
            onClick={async () => {
              await onCreate(
                {
                  name: title.trim(),
                  description: description.trim(),
                  content: body,
                },
                targets,
              );
              reset();
              onOpenChange(false);
            }}
          >
            {t("skills:global.create.confirm", { count: targets.length })}
          </AsyncButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
