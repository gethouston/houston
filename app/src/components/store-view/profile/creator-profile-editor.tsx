import {
  HANDLE_REGEX,
  normalizeHandle,
  RESERVED_HANDLES,
} from "@houston/agentstore-contract";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
} from "@houston-ai/core";
import type { CreatorLinks } from "@houston-ai/engine-client";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMyStoreProfile } from "../../../hooks/use-my-store-profile";
import { getEngine } from "../../../lib/engine";
import { reportError } from "../../../lib/error-toast";
import { useUIStore } from "../../../stores/ui";
import { AvatarUploadField } from "./avatar-upload-field";
import { BioField } from "./bio-field";
import { HandleField } from "./handle-field";
import { buildProfilePatch, canSaveProfile } from "./profile-form";
import { gatewayErrorCode } from "./save-error";
import { HANDLE_ERROR_KEYS, saveErrorKey } from "./save-error-map";
import { SocialsEditor } from "./socials-editor";

/**
 * The creator-profile editor: claim an `@handle` for the first time, or edit an
 * existing profile's handle, display name, bio, links, and avatar. A
 * self-contained dialog driven by the `creatorEditorOpen` UI flag (opened from
 * the user menu). Reads and writes the shared `useMyStoreProfile` cache; the
 * avatar is its own immediate mutation while the rest lands on Save.
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
  const addToast = useUIStore((s) => s.addToast);
  const displayNameId = useId();

  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [links, setLinks] = useState<CreatorLinks>({});
  const [handleServerError, setHandleServerError] = useState<string | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const seeded = useRef(false);

  // Seed the form ONCE per open, from server truth — never re-seed on a later
  // profile refresh (an avatar upload invalidates the cache mid-edit, and
  // re-seeding would wipe the user's in-progress name/bio/link edits).
  useEffect(() => {
    if (!open) {
      seeded.current = false;
      return;
    }
    if (seeded.current || isPending) return;
    setHandle(profile?.handle ?? "");
    setDisplayName(profile?.displayName ?? "");
    setBio(profile?.bio ?? "");
    setLinks(profile?.links ?? {});
    setHandleServerError(null);
    seeded.current = true;
  }, [open, isPending, profile]);

  const claiming = !profile?.handle;
  const normalized = normalizeHandle(handle);
  const handleChanged = normalized !== (profile?.handle ?? "");
  const handleValid =
    HANDLE_REGEX.test(normalized) && !RESERVED_HANDLES.has(normalized);
  const canSave = canSaveProfile({
    claiming,
    handleChanged,
    handleValid,
    displayName,
    links,
    saving,
  });

  const handleSave = async () => {
    const patch = buildProfilePatch(
      { handle: normalized, displayName, bio, links },
      profile,
    );
    if (Object.keys(patch).length === 0) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    setHandleServerError(null);
    try {
      await getEngine().updateMyStoreProfile(patch);
      await invalidate();
      addToast({ title: t("profile.saved"), variant: "success" });
      onOpenChange(false);
    } catch (err) {
      const code = gatewayErrorCode(err);
      reportError(
        "store_update_profile",
        `updateMyStoreProfile failed (${code ?? "unknown"})`,
        err,
      );
      const handleKey = code ? HANDLE_ERROR_KEYS[code] : undefined;
      if (handleKey) setHandleServerError(t(handleKey));
      else addToast({ title: t(saveErrorKey(code)), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {claiming ? t("profile.claimTitle") : t("profile.title")}
          </DialogTitle>
          {claiming && (
            <DialogDescription>{t("profile.claimBody")}</DialogDescription>
          )}
        </DialogHeader>
        <div className="space-y-4">
          <HandleField
            value={handle}
            onChange={(v) => {
              setHandle(v);
              setHandleServerError(null);
            }}
            serverError={handleServerError}
            disabled={saving}
          />
          <div className="space-y-1.5">
            <label
              htmlFor={displayNameId}
              className="text-sm font-medium text-ink"
            >
              {t("profile.displayNameLabel")}
            </label>
            <Input
              id={displayNameId}
              value={displayName}
              maxLength={80}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={saving}
            />
          </div>
          <AvatarUploadField
            avatarUrl={profile?.avatarUrl ?? null}
            displayName={displayName}
            onChanged={() => void invalidate()}
            disabled={saving}
            claiming={claiming}
          />
          <BioField value={bio} onChange={setBio} disabled={saving} />
          <SocialsEditor value={links} onChange={setLinks} disabled={saving} />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t("profile.cancel")}
          </Button>
          <Button type="button" onClick={handleSave} disabled={!canSave}>
            {saving && <Spinner className="size-4" />}
            {saving ? t("profile.saving") : t("profile.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
