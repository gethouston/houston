import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@houston-ai/core";
import {
  type ProfileEditorPatch,
  ProfileEditorScreen,
} from "@houston-ai/store";
import { useTranslation } from "react-i18next";
import { useMyStoreProfile } from "../../../hooks/use-my-store-profile";
import { getEngine } from "../../../lib/engine";
import { gatewayErrorCode } from "./save-error";

/** Attach the gateway's machine error code so the shared screen's copy map
 *  can translate it; rethrows — a failed save must never be swallowed. */
function withCode(err: unknown): never {
  const code = gatewayErrorCode(err);
  if (err instanceof Error && code) throw Object.assign(err, { code });
  throw err instanceof Error ? err : new Error(String(err));
}

/**
 * The creator-profile editor dialog: the app shell (open flag, dialog frame)
 * around the SHARED ProfileEditorScreen — composition and copy live in
 * @houston-ai/store, identical to the website's /me/profile.
 */
export function CreatorProfileEditorDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("store");
  const { profile, isPending, invalidate } = useMyStoreProfile();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader className="sr-only">
          <DialogTitle>{t("profile.title")}</DialogTitle>
          <DialogDescription>{t("profile.claimTitle")}</DialogDescription>
        </DialogHeader>
        {isPending ? (
          <div className="flex items-center gap-3 py-8 text-ink-muted">
            <Spinner /> {t("me.loadingAgents")}
          </div>
        ) : (
          <ProfileEditorScreen
            key={open ? "open" : "closed"}
            initial={
              profile?.handle
                ? {
                    handle: profile.handle,
                    displayName: profile.displayName ?? "",
                    bio: profile.bio ?? "",
                    links: profile.links ?? {},
                    avatarUrl: profile.avatarUrl ?? null,
                  }
                : null
            }
            currentHandle={profile?.handle ?? null}
            onSave={async (patch: ProfileEditorPatch) => {
              try {
                const saved = await getEngine().updateMyStoreProfile(patch);
                invalidate();
                return {
                  handle: saved.handle ?? "",
                  displayName: saved.displayName ?? "",
                  bio: saved.bio ?? "",
                  links: saved.links ?? {},
                  avatarUrl: saved.avatarUrl ?? null,
                };
              } catch (err) {
                withCode(err);
              }
            }}
            checkHandle={(handle) => getEngine().checkStoreHandle(handle)}
            uploadAvatar={async (file) => {
              const result = await getEngine().uploadStoreAvatar(file);
              invalidate();
              return result;
            }}
            deleteAvatar={async () => {
              await getEngine().deleteStoreAvatar();
              invalidate();
            }}
            labels={{
              claimTitle: t("me.editor.claimTitle"),
              claimIntro: t("me.editor.claimIntro"),
              editTitle: t("me.editor.editTitle"),
              editIntro: t("me.editor.editIntro"),
              errorTitle: t("myAgents.actionFailed"),
              savedTitle: t("me.editor.savedTitle"),
              savedBody: t("me.editor.savedBody"),
              nameLabel: t("me.editor.nameLabel"),
              optional: t("me.editor.optional"),
              namePlaceholder: t("me.editor.namePlaceholder"),
              nameHint: t("me.editor.nameHint"),
              bioLabel: t("me.editor.bioLabel"),
              bioPlaceholder: t("me.editor.bioPlaceholder"),
              create: t("me.editor.create"),
              save: t("me.editor.save"),
              saveFailed: t("me.editor.saveFailed"),
              networkFailed: t("me.editor.networkFailed"),
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
