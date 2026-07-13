/**
 * Manage view shown when the share wizard opens on an already-published agent:
 * the live listing URL, an "update listing" entry back into the pick flow, and
 * a confirm-gated "remove from store".
 */

import { Button, ConfirmDialog } from "@houston-ai/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useUIStore } from "../../stores/ui";
import { STORE_VIEW_ID } from "../store-view";
import { storeSlugFromShareUrl } from "../store-view/store-view-model";
import { ShareLink, UnlistedNote } from "./share-screen";

export function ManagePublication({
  agentName,
  shareUrl,
  busy,
  onUpdate,
  onRemove,
}: {
  agentName: string;
  shareUrl: string;
  busy: boolean;
  onUpdate: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation("portable");
  const [confirming, setConfirming] = useState(false);
  const storeSlug = storeSlugFromShareUrl(shareUrl);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-[28px] font-normal leading-tight">
          {t("publish.manage.title", { name: agentName })}
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          {t("publish.manage.body")}
        </p>
      </header>

      <ShareLink shareUrl={shareUrl} />
      <UnlistedNote />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button className="rounded-full" onClick={onUpdate} disabled={busy}>
            {t("publish.manage.update")}
          </Button>
          {storeSlug && (
            <Button
              variant="outline"
              className="rounded-full"
              disabled={busy}
              onClick={() => {
                const ui = useUIStore.getState();
                ui.setShareAgentId(null);
                ui.setStoreFocusSlug(storeSlug);
                ui.setViewMode(STORE_VIEW_ID);
              }}
            >
              {t("publish.manage.seeInStore")}
            </Button>
          )}
          <Button
            variant="outline"
            className="rounded-full text-destructive hover:text-destructive"
            onClick={() => setConfirming(true)}
            disabled={busy}
          >
            {t("publish.manage.remove")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("publish.manage.updateHint")}
        </p>
      </section>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("publish.manage.removeConfirmTitle")}
        description={t("publish.manage.removeConfirmBody", { name: agentName })}
        confirmLabel={t("publish.manage.removeConfirm")}
        cancelLabel={t("publish.manage.removeCancel")}
        onConfirm={onRemove}
      />
    </div>
  );
}
