/**
 * One model card in the directory grid, in the AI-hub's visual language and
 * shaped like the allowed-models editor's rows: the model's colorful
 * {@link BrandMark}, its friendly name, its muted lab name, and an
 * always-visible trailing "See more" affordance (label + chevron) that opens the
 * model modal. The whole row is ONE focusable button (no nested buttons); the
 * "See more" cue is a plain span inside it, visible at rest and only brightened
 * on hover, so nothing is hover-gated.
 */

import { ChevronRight } from "lucide-react";
import type { CatalogModel } from "../../lib/ai-hub/catalog-types.ts";
import { BrandMark } from "../provider-browser/brand-mark.tsx";
import { labName, modelMarkId } from "./format.ts";

export function ModelCardRow({
  model,
  seeMoreLabel,
  onOpen,
}: {
  model: CatalogModel;
  /** Localized "See more" cue (also part of the button's accessible name). */
  seeMoreLabel: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full items-center gap-3 rounded-xl bg-secondary px-3 py-2.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <BrandMark providerId={modelMarkId(model)} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-foreground">
          {model.name}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {labName(model.lab)}
        </div>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
        {seeMoreLabel}
        <ChevronRight className="size-3.5" aria-hidden="true" />
      </span>
    </button>
  );
}
