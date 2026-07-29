import { useState } from "react";
import {
  useCustomIntegrationsFor,
  useRemoveCustomIntegration,
} from "../../hooks/queries";
import { CustomDeleteDialog } from "./custom-delete-dialog";
import { CustomDetailDialog } from "./custom-detail-dialog";
import { CustomKeyDialog } from "./custom-key-dialog";

/**
 * The one selection state behind the custom-integration dialog trio (detail /
 * key / delete). Slug-keyed on purpose: the dialogs re-derive the FRESH view
 * from the live list on every render, so a key save flips the open detail
 * card to its active state, and a removal (here or from anywhere else) closes
 * whatever was open on the vanished slug instead of showing a ghost.
 */
export interface CustomSelection {
  detailSlug: string | null;
  keySlug: string | null;
  removeSlug: string | null;
  openDetail: (slug: string) => void;
  openKey: (slug: string) => void;
  openRemove: (slug: string) => void;
  closeDetail: () => void;
  closeKey: () => void;
  closeRemove: () => void;
}

export function useCustomSelection(): CustomSelection {
  const [detailSlug, setDetailSlug] = useState<string | null>(null);
  const [keySlug, setKeySlug] = useState<string | null>(null);
  const [removeSlug, setRemoveSlug] = useState<string | null>(null);
  return {
    detailSlug,
    keySlug,
    removeSlug,
    openDetail: setDetailSlug,
    openKey: setKeySlug,
    openRemove: setRemoveSlug,
    closeDetail: () => setDetailSlug(null),
    closeKey: () => setKeySlug(null),
    closeRemove: () => setRemoveSlug(null),
  };
}

/**
 * The dialog trio for one surface, driven by {@link useCustomSelection}. With
 * an `agentId` every read/write rides the per-agent routes (HOU-823), so the
 * per-agent Integrations tab keeps working behind the hosted gateway (where
 * the top-level custom routes 404). The detail card's own Enter/Update key and
 * Remove buttons chain into the sibling dialogs, closing the detail first so
 * one modal is on stage at a time.
 */
export function CustomIntegrationDialogs({
  selection,
  agentId,
}: {
  selection: CustomSelection;
  agentId?: string;
}) {
  const list = useCustomIntegrationsFor(agentId);
  const remove = useRemoveCustomIntegration(agentId);
  const items = list.data ?? [];
  const bySlug = (slug: string | null) =>
    slug === null ? null : (items.find((i) => i.slug === slug) ?? null);

  return (
    <>
      <CustomDetailDialog
        integration={bySlug(selection.detailSlug)}
        agentId={agentId}
        onClose={selection.closeDetail}
        onEnterKey={(integration) => {
          selection.closeDetail();
          selection.openKey(integration.slug);
        }}
        onRemove={(integration) => {
          selection.closeDetail();
          selection.openRemove(integration.slug);
        }}
      />
      <CustomKeyDialog
        integration={bySlug(selection.keySlug)}
        agentId={agentId}
        onClose={selection.closeKey}
      />
      <CustomDeleteDialog
        integration={bySlug(selection.removeSlug)}
        onClose={selection.closeRemove}
        onConfirm={(integration) => remove.mutate(integration.slug)}
      />
    </>
  );
}
