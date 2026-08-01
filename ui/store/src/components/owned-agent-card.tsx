"use client";

import {
  Badge,
  Button,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { Pencil, Share2, SquarePen } from "lucide-react";
import { useState } from "react";

import type {
  OwnedAgentIdentity,
  OwnedAgentRow,
  StoreCategoryRow,
  StoreLinkComponent,
} from "../types";
import { AgentCard, type AgentCardLabels } from "./agent-card";
import { EditListingDialog } from "./edit-listing-dialog";
import type { EditListingDialogLabels } from "./edit-listing-model";
import {
  ShareAgentDialog,
  type ShareAgentDialogLabels,
  type ShareVisibility,
  shareVisibilityOf,
} from "./share-agent-dialog";

export interface OwnedAgentCardLabels {
  stateDraft: string;
  stateUnpublished: string;
  visibilityUnlisted: string;
  manage: string;
  edit: string;
  share: string;
  delete: string;
  deleteTitle: (name: string) => string;
  deleteBody: string;
}

export const OWNED_AGENT_CARD_LABELS: OwnedAgentCardLabels = {
  stateDraft: "Private",
  stateUnpublished: "Private",
  visibilityUnlisted: "Hidden",
  manage: "Edit agent",
  edit: "Edit listing…",
  share: "Share…",
  delete: "Delete",
  deleteTitle: (name) => `Delete ${name}?`,
  deleteBody:
    "This removes the agent from the store. Published pages stop resolving. This cannot be undone.",
};

export interface OwnedAgentCardProps {
  agent: OwnedAgentRow;
  href: string;
  busy: boolean;
  /** Drive-style visibility change from the Share dialog. */
  onShareSelect: (visibility: ShareVisibility) => void;
  onDelete: () => void;
  /** Persist the Edit-listing dialog's identity patch; absent hides the item. */
  onEditSave?: (identity: OwnedAgentIdentity) => Promise<void>;
  /** The store's category vocabulary for the Edit-listing dialog. */
  categories?: StoreCategoryRow[];
  /** The surface's install action for the visible Try button. */
  onTry?: (agent: OwnedAgentRow) => void;
  /** The agent's public link, for the Share dialog's copy affordance. */
  shareHref?: string | null;
  labels?: Partial<OwnedAgentCardLabels>;
  shareLabels?: Partial<ShareAgentDialogLabels>;
  editLabels?: Partial<EditListingDialogLabels>;
  cardLabels?: Partial<AgentCardLabels>;
  LinkComponent?: StoreLinkComponent;
}

/**
 * THE owner's agent card: the PUBLIC AgentCard verbatim, wearing a corner
 * state badge (only when not publicly listed) and a visible pencil menu —
 * Edit listing… · Share… · Delete. Visibility lives in the Share dialog.
 */
export function OwnedAgentCard({
  agent,
  href,
  busy,
  onShareSelect,
  onDelete,
  onEditSave,
  categories,
  onTry,
  shareHref,
  labels: overrides,
  shareLabels,
  editLabels,
  cardLabels,
  LinkComponent,
}: OwnedAgentCardProps) {
  const labels = { ...OWNED_AGENT_CARD_LABELS, ...overrides };
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [publicRequested, setPublicRequested] = useState(false);
  const visibility = shareVisibilityOf(agent);
  const stateBadge =
    visibility === "private"
      ? labels.stateDraft
      : visibility === "hidden"
        ? labels.visibilityUnlisted
        : null;
  return (
    <div className="relative">
      <AgentCard
        agent={agent}
        href={href}
        LinkComponent={LinkComponent}
        onTry={onTry}
        labels={cardLabels}
      />
      <div className="absolute top-4 right-4 flex items-center gap-2">
        {stateBadge && <Badge variant="secondary">{stateBadge}</Badge>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-label={labels.manage}
              disabled={busy}
              className="size-8 rounded-full p-0 text-ink-muted hover:text-ink"
            >
              <Pencil className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {onEditSave && (
              <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                <SquarePen className="size-4" />
                {labels.edit}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => setShareOpen(true)}>
              <Share2 className="size-4" />
              {labels.share}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setConfirmOpen(true)}
            >
              {labels.delete}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {onEditSave && (
        <EditListingDialog
          agent={agent}
          open={editOpen}
          onOpenChange={setEditOpen}
          categories={categories ?? []}
          onSave={onEditSave}
          labels={editLabels}
        />
      )}
      <ShareAgentDialog
        agent={agent}
        open={shareOpen}
        onOpenChange={setShareOpen}
        publicRequested={publicRequested}
        busy={busy}
        shareHref={shareHref}
        labels={shareLabels}
        onSelect={(next) => {
          if (next === "public") setPublicRequested(true);
          onShareSelect(next);
        }}
      />
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={labels.deleteTitle(agent.name)}
        description={labels.deleteBody}
        confirmLabel={labels.delete}
        variant="destructive"
        onConfirm={() => {
          setConfirmOpen(false);
          onDelete();
        }}
      />
    </div>
  );
}
