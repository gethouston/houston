import { Button, Input } from "@houston-ai/core";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useMyEditableProfile,
  useSetMyProfile,
} from "../../../hooks/queries/use-my-editable-profile";
import { useMyProfile } from "../../../hooks/use-my-profile";
import { useSession } from "../../../hooks/use-session";
import { isIdentityConfigured } from "../../../lib/identity";
import { useUIStore } from "../../../stores/ui";
import { SettingsCard } from "../settings-row";
import { ProfilePhotoRow } from "./profile-photo";

/** The gateway's own ceiling: `PUT /v1/me/profile` answers 400 above it. */
const NAME_MAX_CHARS = 60;

/**
 * Whether Settings shows the Profile section at all. Gated by DATA, never by a
 * flag: the section appears only once the profile READ succeeded, so a host
 * that 404s the route (`data === null`) or a read that failed hides an editor
 * that could not save anyway. Mirrors {@link useMigrationAvailable} in shape:
 * a hook the settings view calls to gate one row of the index.
 */
export function useProfileAvailable(): boolean {
  const { data: session } = useSession();
  const { data } = useMyEditableProfile();
  return isIdentityConfigured() && !!session && data != null;
}

/** The inline validation key for a trimmed name, or `null` when it is fine. */
function nameErrorKey(trimmed: string): "nameEmpty" | "nameTooLong" | null {
  if (!trimmed) return "nameEmpty";
  if (trimmed.length > NAME_MAX_CHARS) return "nameTooLong";
  return null;
}

/**
 * The display-name field. Mounted with the saved name as its seed and REMOUNTED
 * by its `key` whenever that saved name changes, so the field re-syncs to server
 * truth without an effect that could overwrite what the user is mid-way through
 * typing. Validation is inline under the field (a toast would scroll away from
 * the thing it is talking about); the save failure path is owned by `call()` in
 * `lib/tauri.ts`, so only SUCCESS is announced here.
 */
function ProfileNameForm({ savedName }: { savedName: string }) {
  const { t } = useTranslation("settings");
  const addToast = useUIStore((s) => s.addToast);
  const setProfile = useSetMyProfile();
  const fieldId = useId();
  const errorId = useId();
  const [value, setValue] = useState(savedName);
  const [touched, setTouched] = useState(false);

  const trimmed = value.trim();
  const errorKey = nameErrorKey(trimmed);
  const pending = setProfile.isPending;
  const showError = touched && errorKey !== null;
  const canSave = !pending && errorKey === null && trimmed !== savedName.trim();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    if (!canSave) return;
    setProfile.mutate(
      { displayName: trimmed },
      { onSuccess: () => addToast({ title: t("profile.toasts.saved") }) },
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2 px-4 py-4">
      <label htmlFor={fieldId} className="block text-sm font-medium text-ink">
        {t("profile.name.label")}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={fieldId}
          value={value}
          maxLength={NAME_MAX_CHARS}
          disabled={pending}
          placeholder={t("profile.name.placeholder")}
          aria-invalid={showError || undefined}
          aria-describedby={showError ? errorId : undefined}
          data-testid="profile-name-input"
          onChange={(event) => {
            setValue(event.target.value);
            setTouched(true);
          }}
        />
        <Button
          type="submit"
          disabled={!canSave}
          data-testid="profile-name-save"
        >
          {pending ? t("profile.saving") : t("profile.save")}
        </Button>
      </div>
      {showError ? (
        <p id={errorId} className="text-xs text-danger">
          {t(`profile.errors.${errorKey}`)}
        </p>
      ) : (
        <p className="text-xs text-ink-muted">{t("profile.name.hint")}</p>
      )}
    </form>
  );
}

/**
 * Settings > Profile: the name and picture every multiplayer surface renders
 * for this user — chat sender rows, face stacks, mentions, the team roster. One
 * card, two hairline-divided rows.
 */
export function ProfileSection() {
  const { t } = useTranslation("settings");
  const { data: profile } = useMyEditableProfile();
  const me = useMyProfile();

  if (!profile) return null;

  // The gateway's effective name, falling back to the resolved self-identity
  // for a user whose provider gave no name and who has not set one yet.
  const savedName = profile.displayName ?? me?.name ?? "";

  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold text-ink text-balance">
        {t("profile.title")}
      </h2>
      <p className="mb-6 text-sm text-ink-muted">{t("profile.subtitle")}</p>
      <SettingsCard>
        <ProfilePhotoRow displayName={savedName} />
        <ProfileNameForm key={savedName} savedName={savedName} />
      </SettingsCard>
    </section>
  );
}
