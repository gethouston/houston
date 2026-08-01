"use client";

import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { Check, Copy, Eye, Link2, Lock } from "lucide-react";
import { useState } from "react";

import type { OwnedAgentRow } from "../types";

/** The Drive-style visibility levels the share dialog offers. */
export type ShareVisibility = "public" | "hidden" | "private";

export interface ShareAgentDialogLabels {
  title: (name: string) => string;
  publicTitle: string;
  publicBody: string;
  publicPending: string;
  hiddenTitle: string;
  hiddenBody: string;
  privateTitle: string;
  privateBody: string;
  copyLink: string;
  copied: string;
}

export const SHARE_AGENT_DIALOG_LABELS: ShareAgentDialogLabels = {
  title: (name) => `Share ${name}`,
  publicTitle: "Public",
  publicBody: "Anyone can find it in the store.",
  publicPending: "Needs a quick review before it appears publicly.",
  hiddenTitle: "Hidden",
  hiddenBody: "Anyone with the link can see and install it.",
  privateTitle: "Private",
  privateBody: "Only you. The page and link stop working.",
  copyLink: "Copy link",
  copied: "Copied",
};

/** The agent's current level in share terms. */
export function shareVisibilityOf(agent: OwnedAgentRow): ShareVisibility {
  if (agent.state !== "published") return "private";
  return agent.visibility === "public" ? "public" : "hidden";
}

const OPTIONS: ReadonlyArray<{
  value: ShareVisibility;
  icon: typeof Eye;
}> = [
  { value: "public", icon: Eye },
  { value: "hidden", icon: Link2 },
  { value: "private", icon: Lock },
];

export interface ShareAgentDialogProps {
  agent: OwnedAgentRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** True once a public-listing request was sent this session. */
  publicRequested?: boolean;
  onSelect: (visibility: ShareVisibility) => void;
  /** The agent's link, shown with a copy affordance unless private. */
  shareHref?: string | null;
  busy?: boolean;
  labels?: Partial<ShareAgentDialogLabels>;
}

/**
 * THE share dialog — Google-Drive-style visibility for a listing: public
 * (store-findable, review-gated), hidden (link only), private (only you).
 * One shared composition so web and app cannot drift.
 */
export function ShareAgentDialog({
  agent,
  open,
  onOpenChange,
  publicRequested,
  onSelect,
  shareHref,
  busy,
  labels: overrides,
}: ShareAgentDialogProps) {
  const labels = { ...SHARE_AGENT_DIALOG_LABELS, ...overrides };
  const current = shareVisibilityOf(agent);
  const [copied, setCopied] = useState(false);
  const copy = {
    public: { title: labels.publicTitle, body: labels.publicBody },
    hidden: { title: labels.hiddenTitle, body: labels.hiddenBody },
    private: { title: labels.privateTitle, body: labels.privateBody },
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{labels.title(agent.name)}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {OPTIONS.map(({ value, icon: Icon }) => {
            const active = current === value;
            const pending =
              value === "public" && !active && publicRequested === true;
            return (
              <button
                key={value}
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!active) onSelect(value);
                }}
                className={cn(
                  "flex items-start gap-3 rounded-2xl p-4 text-left transition-colors duration-150",
                  active ? "bg-chip" : "bg-chip-subtle hover:bg-chip",
                )}
              >
                <Icon
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-ink-muted"
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-center gap-2 font-medium text-[14px] text-ink">
                    {copy[value].title}
                    {active && (
                      <Check aria-hidden className="size-4 text-success" />
                    )}
                  </span>
                  <span className="text-[13px] text-ink-muted">
                    {pending ? labels.publicPending : copy[value].body}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {current !== "private" && shareHref && (
          <Button
            type="button"
            variant="outline"
            className="w-full rounded-full"
            onClick={() => {
              void navigator.clipboard.writeText(shareHref).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              });
            }}
          >
            {copied ? (
              <Check className="size-4 text-success" />
            ) : (
              <Copy className="size-4" />
            )}
            {copied ? labels.copied : labels.copyLink}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
