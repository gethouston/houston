"use client";

import { ChevronLeftIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "./button";
import { DialogTitle } from "./dialog";

export interface FlowSheetCompactHeaderProps {
  /** The step's own question. It IS the dialog's title here, not a label. */
  title: string;
  back?: { label: string; onClick: () => void };
  progress?: ReactNode;
  headerAside?: ReactNode;
}

/**
 * The COMPACT frame's header, read as a confirm dialog rather than a wizard:
 * the question top-left in the dialog's own type, the way back as an icon chip
 * inline before it, and the close X left to DialogContent's own, top-right.
 *
 * A step that asks one short thing should look like something the product
 * asked, not like a flow that shrank — so there is no three-slot row and no
 * second, smaller title floating above the content. `pr-8` is what keeps a
 * long question clear of the absolutely positioned X.
 *
 * The back chip is the app's `BackControl size="compact"` shape — a 32px
 * icon-only target — because that is the way back everywhere else a header
 * already carries a dense cluster beside it.
 *
 * Progress, when the step reports any, sits UNDER the title: the compact frame
 * has no centre slot to hold it, and a bar drawn over the question would read
 * as chrome bolted onto a dialog.
 */
export function FlowSheetCompactHeader({
  title,
  back,
  progress,
  headerAside,
}: FlowSheetCompactHeaderProps) {
  return (
    <header
      data-slot="flow-sheet-header"
      className="flex shrink-0 flex-col gap-3"
    >
      <div className="flex items-center gap-2 pr-8">
        {back ? (
          <Button
            type="button"
            data-slot="flow-sheet-back"
            variant="ghost"
            size="icon-sm"
            className="-ml-1.5 text-ink-muted hover:text-ink"
            aria-label={back.label}
            onClick={back.onClick}
          >
            <ChevronLeftIcon aria-hidden="true" />
          </Button>
        ) : null}
        <DialogTitle className="min-w-0 flex-1">{title}</DialogTitle>
        {headerAside ? (
          <div data-slot="flow-sheet-aside" className="shrink-0">
            {headerAside}
          </div>
        ) : null}
      </div>
      {progress ? <div data-slot="flow-sheet-progress">{progress}</div> : null}
    </header>
  );
}
