import { useEffect, useMemo, useState } from "react";
import {
  claimSignInTab,
  useCustomIntegrationsFor,
  useRemoveCustomIntegration,
  useStartCustomOAuth,
} from "../../hooks/queries";
import { CustomDeleteDialog } from "./custom-delete-dialog";
import { CustomDetailDialog } from "./custom-detail-dialog";
import { CustomEditDialog } from "./custom-edit-dialog";
import { CustomKeyDialog } from "./custom-key-dialog";

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
  return useMemo(
    () => ({
      detailSlug,
      keySlug,
      removeSlug,
      openDetail: setDetailSlug,
      openKey: setKeySlug,
      openRemove: setRemoveSlug,
      closeDetail: () => setDetailSlug(null),
      closeKey: () => setKeySlug(null),
      closeRemove: () => setRemoveSlug(null),
    }),
    [detailSlug, keySlug, removeSlug],
  );
}

export function CustomIntegrationDialogs({
  selection,
  agentId,
}: {
  selection: CustomSelection;
  agentId?: string;
}) {
  const list = useCustomIntegrationsFor(agentId);
  const [editSlug, setEditSlug] = useState<string | null>(null);
  const remove = useRemoveCustomIntegration(agentId);
  const signIn = useStartCustomOAuth(agentId);
  const items = useMemo(() => list.data ?? [], [list.data]);
  const bySlug = (slug: string | null) =>
    slug === null ? null : (items.find((i) => i.slug === slug) ?? null);

  const resolved = Array.isArray(list.data);
  const editing = bySlug(editSlug);
  useEffect(() => {
    if (!resolved) return;
    const gone = (slug: string | null) =>
      slug !== null && !items.some((i) => i.slug === slug);
    if (gone(selection.detailSlug)) selection.closeDetail();
    if (gone(selection.keySlug)) selection.closeKey();
    if (gone(selection.removeSlug)) selection.closeRemove();
    if (gone(editSlug)) setEditSlug(null);
  }, [resolved, items, selection, editSlug]);

  return (
    <>
      <CustomDetailDialog
        integration={bySlug(selection.detailSlug)}
        onClose={selection.closeDetail}
        onEdit={(integration) => {
          selection.closeDetail();
          setEditSlug(integration.slug);
        }}
        onEnterKey={(integration) => {
          selection.closeDetail();
          selection.openKey(integration.slug);
        }}
        onSignIn={(integration) => {
          signIn.mutate({ slug: integration.slug, tab: claimSignInTab() });
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
      {editing && (
        <CustomEditDialog
          key={editing.slug}
          integration={editing}
          agentId={agentId}
          onClose={() => setEditSlug(null)}
        />
      )}
      <CustomDeleteDialog
        integration={bySlug(selection.removeSlug)}
        onClose={selection.closeRemove}
        onConfirm={(integration) => remove(integration.slug)}
      />
    </>
  );
}
