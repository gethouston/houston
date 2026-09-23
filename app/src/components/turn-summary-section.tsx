import type { ChatActionBrand } from "@houston-ai/chat";
import { cn } from "@houston-ai/core";
import type { TFunction } from "i18next";
import {
  CheckCircle2,
  ChevronDownIcon,
  Lightbulb,
  Play,
  ScrollText,
} from "lucide-react";
import { fileNameOf } from "../lib/agent-file-paths";
import { humanizeSkillName } from "../lib/humanize-skill-name";
import type {
  SemanticUpdateKind,
  TurnSummaryItem,
} from "../lib/turn-summary-items";
import { getFileIcon } from "./file-card";
import { IntegrationUpdateRow } from "./turn-summary-integration-row";

/** Every row species but the integration one, which renders its own row. */
type SummaryRowItem = Exclude<TurnSummaryItem, { kind: "integration" }>;

/**
 * One collapsible group of the turn-end summary ("Updates made" / "N new
 * files"). Four row species: agent files (open in preview/OS), saved skills
 * (named after the skill whose SKILL.md the turn wrote), semantic updates
 * (jump to the matching tab), and external-artifact integration rows
 * (PRODUCT-1196). `done` renders the header's success checkmark.
 */
export function TurnSummarySection({
  title,
  items,
  open,
  done,
  onOpenChange,
  onOpenFile,
  onOpenSemantic,
  onOpenUrl,
  resolveBrand,
  t,
}: {
  title: string;
  items: TurnSummaryItem[];
  open: boolean;
  done?: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenFile: (path: string) => void;
  onOpenSemantic?: (kind: SemanticUpdateKind) => void;
  onOpenUrl: (url: string) => void;
  resolveBrand: (action: string) => ChatActionBrand | undefined;
  t: TFunction<"chat">;
}) {
  return (
    <div className="rounded-lg border border-line/50 bg-chip overflow-hidden">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-muted hover:text-ink transition-colors"
      >
        <ChevronDownIcon
          className={cn(
            "h-4 w-4 transition-transform",
            open ? "rotate-0" : "-rotate-90",
          )}
        />
        <span>{title}</span>
        {done && (
          <CheckCircle2 aria-hidden className="h-4 w-4 shrink-0 text-success" />
        )}
      </button>
      {open && (
        <div className="border-t border-line/50 divide-y divide-line/50">
          {items.map((item) => {
            if (item.kind === "integration")
              return (
                <IntegrationUpdateRow
                  key={`${item.action}|${item.url ?? ""}`}
                  action={item.action}
                  url={item.url}
                  brand={resolveBrand(item.action)}
                  onOpenUrl={onOpenUrl}
                />
              );
            const content = (
              <>
                <ItemIcon item={item} />
                <span className="truncate">{itemLabel(item, t)}</span>
              </>
            );
            // A settings target the user cannot reach is stated, not offered.
            if (item.kind !== "file" && !onOpenSemantic)
              return (
                <div
                  key={rowKey(item)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left"
                >
                  {content}
                </div>
              );
            return (
              <button
                key={rowKey(item)}
                type="button"
                onClick={() => activate(item, onOpenFile, onOpenSemantic)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-hover transition-colors"
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function rowKey(item: SummaryRowItem): string {
  if (item.kind === "file") return `file:${item.path}`;
  if (item.kind === "skill") return `skill:${item.slug}`;
  return `semantic:${item.update}`;
}

function activate(
  item: SummaryRowItem,
  onOpenFile: (path: string) => void,
  onOpenSemantic?: (kind: SemanticUpdateKind) => void,
): void {
  if (item.kind === "file") {
    onOpenFile(item.path);
    return;
  }
  // A saved skill lands in the same place its generic row does: the agent's
  // Skills section, which is where the saved skill can be read and edited.
  onOpenSemantic?.(item.kind === "skill" ? "skills" : item.update);
}

function ItemIcon({ item }: { item: SummaryRowItem }) {
  if (item.kind === "skill")
    return <Play className="h-4 w-4 text-ink-muted shrink-0" />;
  if (item.kind === "semantic") {
    const Icon =
      item.update === "instructions"
        ? ScrollText
        : item.update === "skills"
          ? Play
          : Lightbulb;
    return <Icon className="h-4 w-4 text-ink-muted shrink-0" />;
  }
  const fileName = fileNameOf(item.path);
  const ext = fileName.includes(".")
    ? fileName.split(".").pop()?.toLowerCase()
    : undefined;
  const Icon = getFileIcon(ext);
  return <Icon className="h-4 w-4 text-ink-muted shrink-0" />;
}

function itemLabel(item: SummaryRowItem, t: TFunction<"chat">): string {
  if (item.kind === "skill")
    return t("summary.skillSaved", { name: humanizeSkillName(item.slug) });
  if (item.kind === "semantic") {
    if (item.update === "instructions") return t("summary.instructionsUpdated");
    if (item.update === "skills") return t("summary.skillsUpdated");
    return t("summary.learningsUpdated");
  }
  return fileNameOf(item.path);
}
