import type { AddSkillDialogLabels } from "@houston-ai/skills";
import { AddSkillDialog } from "@houston-ai/skills";
import type { ComponentProps } from "react";
import type { Agent } from "../../lib/types";
import { AgentSkillManageDialog } from "./agent-skill-manage-dialog";

type AddDialogProps = Omit<
  ComponentProps<typeof AddSkillDialog>,
  "open" | "onOpenChange" | "labels"
>;

/**
 * {@link SkillsContent}'s dialog layer, split out to hold the file law: the
 * manual add dialog (GitHub / from scratch) and the per-agent manage dialog a
 * strip row opens (HOU-792 — scoped to THIS agent, no cross-agent assignment),
 * which is the ONE surface that edits or removes an installed skill.
 */
export function SkillsContentDialogs({
  agent,
  addDialogProps,
  dialogLabels,
  dialogOpen,
  onDialogOpenChange,
  managingSlug,
  onCloseManage,
  onEditInChat,
}: {
  agent: Agent;
  /** null hides the add dialog entirely (no create flow). */
  addDialogProps: AddDialogProps | null;
  dialogLabels: AddSkillDialogLabels;
  dialogOpen: boolean;
  onDialogOpenChange: (open: boolean) => void;
  /** The open strip skill's slug, or null. */
  managingSlug: string | null;
  onCloseManage: () => void;
  /** Manage dialog's "Edit in chat" — closes it and opens the setup chat. */
  onEditInChat: (slug: string) => void;
}) {
  return (
    <>
      {addDialogProps && (
        <AddSkillDialog
          open={dialogOpen}
          onOpenChange={onDialogOpenChange}
          {...addDialogProps}
          labels={dialogLabels}
        />
      )}
      {managingSlug !== null && (
        <AgentSkillManageDialog
          agent={agent}
          slug={managingSlug}
          onClose={onCloseManage}
          onEditInChat={onEditInChat}
        />
      )}
    </>
  );
}
