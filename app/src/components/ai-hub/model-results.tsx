import {
  CatalogGrid,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@houston-ai/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { CatalogModel } from "../../lib/ai-hub/catalog-types.ts";
import { ModelCardRow } from "./model-card-row.tsx";

const PAGE = 60;

export function ModelResults({
  models,
  onOpenModel,
  layout = "list",
}: {
  models: CatalogModel[];
  onOpenModel: (key: string) => void;
  layout?: "list" | "grid";
}) {
  const { t } = useTranslation("aiHub");
  const [visible, setVisible] = useState(PAGE);
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

  return (
    <>
      <CatalogGrid columns={layout === "list" ? 1 : "auto"}>
        {models.slice(0, visible).map((model) => (
          <ModelCardRow
            key={model.key}
            model={model}
            onOpen={() => onOpenModel(model.key)}
          />
        ))}
      </CatalogGrid>
      {visible < models.length && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={() => setVisible((value) => value + PAGE)}
            className="rounded-full bg-chip px-4 py-1.5 font-medium text-ink-muted text-xs transition-colors hover:bg-hover hover:text-ink"
          >
            {t("directory.showMore")}
          </button>
        </div>
      )}
    </>
  );
}
