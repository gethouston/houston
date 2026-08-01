"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { ChevronRight } from "lucide-react";
import * as React from "react";

import type { StoreSkillRow } from "../types";

const VISIBLE = 4;
function frontmatterTitle(body: string) {
  const block = /^---\n([\s\S]*?)\n---/.exec(body)?.[1];
  return block
    ? (/^title:\s*(.+)$/m
        .exec(block)?.[1]
        ?.trim()
        .replace(/^["']|["']$/g, "") ?? null)
    : null;
}
function displayTitle(skill: StoreSkillRow) {
  const title = frontmatterTitle(skill.body);
  return (
    title ||
    skill.slug
      .split("-")
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  );
}
function bodyContent(body: string) {
  return body.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
}

export function SkillList({
  skills,
  renderContent,
  labels = {},
}: {
  skills: StoreSkillRow[];
  renderContent: (content: string) => React.ReactNode;
  labels?: Partial<{ viewMore: (count: number) => string }>;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const [active, setActive] = React.useState<StoreSkillRow | null>(null);
  const visible = expanded ? skills : skills.slice(0, VISIBLE);
  const hidden = skills.length - VISIBLE;
  const viewMore = labels.viewMore ?? ((count: number) => `View ${count} more`);
  return (
    <div className="flex flex-col gap-4">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {visible.map((skill) => (
          <li key={skill.slug}>
            <button
              type="button"
              onClick={() => setActive(skill)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl bg-chip-subtle px-5 py-4 text-left transition-colors duration-150 hover:bg-chip"
            >
              <span className="truncate font-medium text-[15px] text-ink">
                {displayTitle(skill)}
              </span>
              <ChevronRight className="size-4 shrink-0 text-ink-muted" />
            </button>
          </li>
        ))}
      </ul>
      {!expanded && hidden > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="self-start text-[14px] text-ink-muted transition-colors duration-150 hover:text-ink"
        >
          {viewMore(hidden)}
        </button>
      ) : null}
      <Dialog
        open={active !== null}
        onOpenChange={(open) => !open && setActive(null)}
      >
        <DialogContent className="max-h-[80vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{active ? displayTitle(active) : null}</DialogTitle>
          </DialogHeader>
          {active ? renderContent(bodyContent(active.body)) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
