/**
 * The creator credit for a publish listing. When the caller has a claimed
 * @handle the store credits them by profile, so the free-text name/link fields
 * are replaced by a read-only "Publishing as @handle" row (avatar + verified
 * badge) with an edit-profile shortcut. Signed in without a handle: the same
 * free-text fallback plus a claim-your-handle nudge. Signed out: the fallback
 * alone.
 *
 * The wire shape is unchanged: the profile's display name is mirrored into the
 * legacy `creatorName` snapshot so the publish payload still carries a name (the
 * gateway overrides the credit from the handle at read time).
 */

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Input,
  VerifiedBadge,
} from "@houston-ai/core";
import { AtSign } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useMyStoreProfile } from "../../hooks/use-my-store-profile";
import { useSession } from "../../hooks/use-session";
import type { ListingForm } from "../../lib/portable-share";
import { useUIStore } from "../../stores/ui";
import { Field } from "./listing-fields";

export function CreatorIdentityField({
  value,
  onChange,
}: {
  value: ListingForm;
  onChange: (next: ListingForm) => void;
}) {
  const { t } = useTranslation("portable");
  const { t: tStore } = useTranslation("store");
  const { profile } = useMyStoreProfile();
  const { data: session } = useSession();
  const setCreatorEditorOpen = useUIStore((s) => s.setCreatorEditorOpen);

  const handle = profile?.handle ?? null;
  const displayName = profile?.displayName;
  const signedIn = Boolean(session);

  // Keep the legacy snapshot in step with the claimed profile so the required
  // creator name is present and the publish request stays well-formed.
  useEffect(() => {
    if (handle && displayName && value.creatorName !== displayName) {
      onChange({ ...value, creatorName: displayName });
    }
  }, [handle, displayName, value, onChange]);

  if (handle) {
    const initial = (displayName || handle).charAt(0).toUpperCase();
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-foreground/10 bg-secondary px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar size="sm">
            {profile?.avatarUrl && (
              <AvatarImage src={profile.avatarUrl} alt="" />
            )}
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>
          <span className="flex min-w-0 items-center gap-1">
            <span className="truncate text-sm text-foreground">
              {t("publish.listing.publishingAs", { handle })}
            </span>
            {profile?.verified && (
              <VerifiedBadge size="sm" label={tStore("creator.verified")} />
            )}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setCreatorEditorOpen(true)}
          className="shrink-0 text-sm font-medium text-action hover:underline"
        >
          {t("publish.listing.editProfile")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {signedIn && (
        <button
          type="button"
          onClick={() => setCreatorEditorOpen(true)}
          className="flex w-full items-center gap-2 rounded-xl border border-dashed border-foreground/15 px-4 py-3 text-left text-sm font-medium text-action hover:bg-foreground/[0.03]"
        >
          <AtSign className="size-4 shrink-0" />
          {t("publish.listing.claimHandleCta")}
        </button>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          htmlFor="listing-creator-name"
          label={t("publish.listing.creatorNameLabel")}
          required
        >
          <Input
            id="listing-creator-name"
            value={value.creatorName}
            onChange={(e) =>
              onChange({ ...value, creatorName: e.target.value })
            }
            placeholder={t("publish.listing.creatorNamePlaceholder")}
          />
        </Field>
        <Field
          htmlFor="listing-creator-url"
          label={t("publish.listing.creatorUrlLabel")}
        >
          <Input
            id="listing-creator-url"
            type="url"
            value={value.creatorUrl}
            onChange={(e) => onChange({ ...value, creatorUrl: e.target.value })}
            placeholder={t("publish.listing.creatorUrlPlaceholder")}
          />
        </Field>
      </div>
    </div>
  );
}
