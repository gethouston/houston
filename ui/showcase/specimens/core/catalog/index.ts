import type { Specimen } from "../../../src/specimen";
import { specimen as catalog } from "./catalog";
import { specimen as catalogDetailDialog } from "./catalog-detail-dialog";
import { specimen as catalogRow } from "./catalog-row";
import { specimen as catalogSearchField } from "./catalog-search-field";
import { specimen as catalogShell } from "./catalog-shell";

export const specimens: readonly Specimen[] = [
  catalog,
  catalogShell,
  catalogRow,
  catalogDetailDialog,
  catalogSearchField,
];
