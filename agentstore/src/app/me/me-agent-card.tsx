"use client";

import { Badge, Button, ConfirmDialog } from "@houston-ai/core";
import { ExternalLink, Trash2 } from "lucide-react";
import * as React from "react";
import { AgentIcon } from "@/components/agent-icon";
import { shareUrlForSlug } from "@/lib/site-config";
import { toDisplayIcon } from "@/lib/store-api-types";
import type { AgentPatch, AgentSummary } from "@/lib/store-client";

const compact = new Intl.NumberFormat("en", { notation: "compact" });

/** Human label + badge tone for an agent's publish state. */
function stateBadge(agent: AgentSummary): {
  label: string;
  tone: "default" | "secondary" | "outline";
} {
  if (agent.state === "published")
    return { label: "Published", tone: "default" };
  if (agent.state === "archived")
    return { label: "Unpublished", tone: "secondary" };
  return { label: "Draft", tone: "outline" };
}

export interface MeAgentCardProps {
  agent: AgentSummary;
  categoryLabel?: string;
  /** True while any mutation on this row is in flight. */
  busy: boolean;
  onPatch: (patch: AgentPatch) => void;
  onDelete: () => void;
}

/**
 * One row in the owner dashboard: identity, state + visibility, install tally,
 * and the state-appropriate actions (publish / unpublish / request public /
 * make unlisted / delete). Delete is guarded by a confirm dialog.
 */
export function MeAgentCard({
  agent,
  categoryLabel,
  busy,
  onPatch,
  onDelete,
}: MeAgentCardProps) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [requested, setRequested] = React.useState(false);
  const badge = stateBadge(agent);
  const published = agent.state === "published";
  const shareUrl = published && agent.slug ? shareUrlForSlug(agent.slug) : null;

  return (
    <article className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <AgentIcon
          icon={toDisplayIcon(agent.icon)}
          name={agent.name}
          className="size-11 text-xl"
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-base font-semibold">
            {agent.name}
          </h3>
          <p className="truncate text-sm text-muted-foreground">
            {agent.tagline ?? categoryLabel ?? agent.category}
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {compact.format(agent.installsCount)} installs
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={badge.tone}>{badge.label}</Badge>
        {published && (
          <Badge variant="secondary">
            {agent.visibility === "public" ? "Public" : "Unlisted"}
          </Badge>
        )}
        {shareUrl && (
          <a
            href={shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary underline underline-offset-4"
          >
            View page
            <ExternalLink aria-hidden className="size-3.5" />
          </a>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(agent.state === "draft" || agent.state === "archived") && (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => onPatch({ publish: true })}
          >
            {agent.state === "archived" ? "Re-publish" : "Publish"}
          </Button>
        )}
        {published && agent.visibility === "unlisted" && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy || requested}
            onClick={() => {
              setRequested(true);
              onPatch({ requestPublic: true });
            }}
          >
            {requested ? "Public listing requested" : "Request public listing"}
          </Button>
        )}
        {published && agent.visibility === "public" && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onPatch({ visibility: "unlisted" })}
          >
            Make unlisted
          </Button>
        )}
        {published && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onPatch({ unpublish: true })}
          >
            Unpublish
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive"
          disabled={busy}
          onClick={() => setConfirmOpen(true)}
        >
          <Trash2 aria-hidden className="size-4" />
          Delete
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete ${agent.name}?`}
        description="This removes the agent from the store. Published pages stop resolving. This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          setConfirmOpen(false);
          onDelete();
        }}
      />
    </article>
  );
}
