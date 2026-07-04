/**
 * A single quiet row in the model directory: lab glyph, model name + one-line
 * description, and right-aligned meta (how many providers offer it, context
 * window, reasoning). The whole row is a keyboard-focusable button that opens
 * the model detail. No hover-only affordances — every element reads at rest.
 */

import { Box } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CatalogModel, LabId } from "../../lib/ai-hub/catalog-types.ts";
import { ProviderGlyph } from "../shell/provider-logos.tsx";
import { ContextChip, ReasoningBadge } from "./hub-badges.tsx";

/** Labs whose id is also a provider id `ProviderGlyph` draws a real logo for. */
const GLYPH_LABS = new Set<LabId>([
  "anthropic",
  "openai",
  "google",
  "deepseek",
  "minimax",
]);

export function ModelRow({
  model,
  onOpen,
}: {
  model: CatalogModel;
  onOpen: (model: CatalogModel) => void;
}) {
  const { t } = useTranslation("aiHub");
  return (
    <button
      type="button"
      onClick={() => onOpen(model)}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
        {GLYPH_LABS.has(model.lab) ? (
          <ProviderGlyph providerId={model.lab} />
        ) : (
          <Box className="size-4 text-muted-foreground" />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] font-medium text-foreground">
          {model.name}
        </span>
        {model.description && (
          <span className="truncate text-xs text-muted-foreground">
            {model.description}
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="hidden text-[11px] text-muted-foreground sm:inline">
          {t("directory.providers", { count: model.offers.length })}
        </span>
        {model.context != null && <ContextChip tokens={model.context} />}
        {model.reasoning && <ReasoningBadge />}
      </span>
    </button>
  );
}
