/**
 * One model row in the directory, in the shared catalog grammar
 * ({@link CatalogRow}, the same flat row the Integrations catalog and the
 * hub's Providers tab use): the model's colorful {@link BrandMark}, its
 * friendly name, its muted lab name. The whole row opens the model modal —
 * models install through a provider offer inside that modal, so the row
 * carries no `+`; the transparent-at-rest hover fill is the click affordance.
 */

import { CatalogRow } from "@houston-ai/core";
import type { CatalogModel } from "../../lib/ai-hub/catalog-types.ts";
import { BrandMark } from "../provider-browser/brand-mark.tsx";
import { labName, modelMarkId } from "./format.ts";

export function ModelCardRow({
  model,
  onOpen,
}: {
  model: CatalogModel;
  onOpen: () => void;
}) {
  return (
    <CatalogRow
      icon={<BrandMark providerId={modelMarkId(model)} size="lg" />}
      title={model.name}
      description={labName(model.lab)}
      onClick={onOpen}
    />
  );
}
