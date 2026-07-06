/**
 * The reusable Mercury models table BODY: hairline-divided rows (one `ModelRow`
 * each) inside a horizontal-scroll track, a 60-row cap with a quiet "Show more"
 * pill, and an Empty state. The sentence-case column header lives in the sticky
 * `LedgerHeader` (rendered by `ModelsBrowser` above the scroll), so it stays
 * pinned; `onScroll` mirrors this body's horizontal scroll onto that header so
 * the two tracks stay column-aligned. Presentational and stateless about
 * filtering — callers pass an already-filtered `CatalogModel[]`.
 */

import {
  cn,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@houston-ai/core";
import type { UIEventHandler } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { CatalogModel } from "../../lib/ai-hub/catalog-types.ts";
import { LEDGER_GRID, ModelRow } from "./model-row.tsx";

const PAGE = 60;

/** Shared `min-w` so the header track and the row track scroll in lockstep. */
export const LEDGER_TRACK = "min-w-[720px]";

/** The sentence-case column header row, on the shared `LEDGER_GRID` + track. */
export function LedgerHeader() {
  const { t } = useTranslation("aiHub");
  return (
    <div
      className={cn(
        LEDGER_TRACK,
        LEDGER_GRID,
        "py-3 text-[12px] font-medium text-muted-foreground",
      )}
    >
      <span>{t("directory.columns.model")}</span>
      <span>{t("directory.columns.goodAt")}</span>
      <span>{t("directory.columns.memory")}</span>
      <span className="text-right">{t("directory.columns.cost")}</span>
      <span className="text-right">{t("directory.columns.offeredBy")}</span>
    </div>
  );
}

export function ModelsLedger({
  models,
  onOpenModel,
  onScroll,
}: {
  models: CatalogModel[];
  onOpenModel: (key: string) => void;
  /** Fires on horizontal scroll so `LedgerHeader` can mirror `scrollLeft`. */
  onScroll?: UIEventHandler<HTMLDivElement>;
}) {
  const { t } = useTranslation("aiHub");
  const [visible, setVisible] = useState(PAGE);

  // A fresh (filtered) list collapses the cap back to the first page. Adjusting
  // state during render (React's documented pattern) keeps the reset in sync
  // with the new list identity and avoids a wasted paint.
  const [shownFor, setShownFor] = useState(models);
  if (shownFor !== models) {
    setShownFor(models);
    setVisible(PAGE);
  }

  if (models.length === 0) {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyTitle>{t("directory.empty.title")}</EmptyTitle>
          <EmptyDescription>
            {t("directory.empty.description")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const shown = models.slice(0, visible);

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto" onScroll={onScroll}>
        <div className={cn(LEDGER_TRACK, "divide-y divide-border")}>
          {shown.map((model) => (
            <ModelRow
              key={model.key}
              model={model}
              onOpen={() => onOpenModel(model.key)}
            />
          ))}
        </div>
      </div>

      {visible < models.length && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={() => setVisible((v) => v + PAGE)}
            className="rounded-full bg-secondary px-4 py-1.5 font-medium text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground"
          >
            {t("directory.showMore")}
          </button>
        </div>
      )}
    </div>
  );
}
