"use client";

import { ChevronLeftIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "./button";
import { DialogTitle } from "./dialog";

export interface FlowSheetCompactHeaderProps {
  title: string;
  back?: { label: string; onClick: () => void };
  progress?: ReactNode;
  headerAside?: ReactNode;
}

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
