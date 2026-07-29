import { Button } from "@houston-ai/core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { InteractionModalPager } from "./interaction-modal";

/**
 * The compact `‹ N of M ›` step navigator in an interaction header.
 * It is shell chrome: Back/Forward are the only cross-kind step navigation.
 */
export function InteractionPager({
  pager,
  disabled,
}: {
  pager: InteractionModalPager;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-0.5 text-ink-muted">
      <Button
        aria-label={pager.backLabel}
        className="size-6"
        disabled={disabled || !pager.onBack}
        onClick={pager.onBack ?? undefined}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <ChevronLeft className="size-4" />
      </Button>
      <span className="px-0.5 text-xs tabular-nums">{pager.label}</span>
      <Button
        aria-label={pager.forwardLabel}
        className="size-6"
        disabled={disabled || !pager.onForward}
        onClick={pager.onForward ?? undefined}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}
