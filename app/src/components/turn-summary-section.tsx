import type { ChatActionBrand } from "@houston-ai/chat";
import { cn } from "@houston-ai/core";
import type { TFunction } from "i18next";
import {
  CheckCircle2,
  ChevronDownIcon,
  ExternalLink,
  Globe,
  Lightbulb,
  Play,
  ScrollText,
  Wrench,
} from "lucide-react";
import { useState } from "react";
import { fileNameOf } from "../lib/agent-file-paths";
import type {
  SemanticUpdateKind,
  TurnSummaryItem,
} from "../lib/turn-summary-items";
import { getFileIcon } from "./file-card";

/**
 * One collapsible group of the turn-end summary ("Updates made" / "N new
 * files"). Three row species: agent files (open in preview/OS), semantic
 * updates (jump to the matching tab), and external-artifact integration rows
 * (PRODUCT-1196) — branded `Gmail · Sent email` rows that open the artifact's
 * URL when the action's result named one, with a visible external-link glyph
 * (never hover-gated). `done` renders the header's success checkmark.
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
  onOpenSemantic: (kind: SemanticUpdateKind) => void;
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
          {items.map((item) =>
            item.kind === "integration" ? (
              <IntegrationUpdateRow
                key={`${item.action}|${item.url ?? ""}`}
                action={item.action}
                url={item.url}
                brand={resolveBrand(item.action)}
                onOpenUrl={onOpenUrl}
              />
            ) : (
              <button
                key={item.kind === "file" ? item.path : item.update}
                type="button"
                onClick={() =>
                  item.kind === "file"
                    ? onOpenFile(item.path)
                    : onOpenSemantic(item.update)
                }
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-hover transition-colors"
              >
                <ItemIcon item={item} />
                <span className="truncate">{itemLabel(item, t)}</span>
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/**
 * An external-artifact row: the app's logo (wrench for custom integrations,
 * globe when no brand art resolves or the favicon 404s) + `{name} · {Sent
 * email}`. With a URL the whole row is a button that opens the artifact and
 * wears a visible external-link glyph; without one it is a plain fact row.
 */
function IntegrationUpdateRow({
  action,
  url,
  brand,
  onOpenUrl,
}: {
  action: string;
  url?: string;
  brand: ChatActionBrand | undefined;
  onOpenUrl: (url: string) => void;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  // The brand resolver only misses on an empty action; still, never render a
  // raw slug — de-underscore it into words as the last resort.
  const label = brand
    ? `${brand.name} · ${brand.doneLabel ?? brand.actionLabel}`
    : action.replace(/_/g, " ").toLowerCase();
  const icon =
    brand?.icon === "tool" ? (
      <Wrench aria-hidden className="h-4 w-4 text-ink-muted shrink-0" />
    ) : brand?.logoUrl && !logoFailed ? (
      <img
        alt=""
        className="h-4 w-4 shrink-0 rounded object-contain"
        decoding="async"
        loading="lazy"
        onError={() => setLogoFailed(true)}
        src={brand.logoUrl}
      />
    ) : (
      <Globe aria-hidden className="h-4 w-4 text-ink-muted shrink-0" />
    );
  const body = (
    <>
      {icon}
      <span className="truncate">{label}</span>
      {url && (
        <ExternalLink
          aria-hidden
          className="h-3.5 w-3.5 text-ink-muted shrink-0 ml-auto"
        />
      )}
    </>
  );
  const rowClass = "w-full flex items-center gap-2 px-3 py-2 text-sm text-left";
  if (!url) return <div className={rowClass}>{body}</div>;
  return (
    <button
      type="button"
      onClick={() => onOpenUrl(url)}
      className={cn(rowClass, "hover:bg-hover transition-colors")}
    >
      {body}
    </button>
  );
}

function ItemIcon({
  item,
}: {
  item: Exclude<TurnSummaryItem, { kind: "integration" }>;
}) {
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

function itemLabel(
  item: Exclude<TurnSummaryItem, { kind: "integration" }>,
  t: TFunction<"chat">,
): string {
  if (item.kind === "semantic") {
    if (item.update === "instructions") return t("summary.instructionsUpdated");
    if (item.update === "skills") return t("summary.skillsUpdated");
    return t("summary.learningsUpdated");
  }
  return fileNameOf(item.path);
}
