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
