import { Button, Input } from "@houston-ai/core";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useMyEditableProfile,
  useSetMyProfile,
} from "../../hooks/queries/use-my-editable-profile";
import { useMyProfile } from "../../hooks/use-my-profile";
import { SettingsCard } from "../settings/settings-row";
import { AccountPage } from "./account-page";
import { ProfilePhotoRow } from "./profile-photo";

const NAME_MAX_CHARS = 60;

function nameErrorKey(trimmed: string): "nameEmpty" | "nameTooLong" | null {
  if (!trimmed) return "nameEmpty";
  if (trimmed.length > NAME_MAX_CHARS) return "nameTooLong";
  return null;
}

function ProfileNameForm({ savedName }: { savedName: string }) {
  const { t } = useTranslation("settings");
  const setProfile = useSetMyProfile();
  const fieldId = useId();
  const errorId = useId();
  const [value, setValue] = useState(savedName);
  const [touched, setTouched] = useState(false);

  const trimmed = value.trim();
  const errorKey = nameErrorKey(trimmed);
  const showError = touched && errorKey !== null;
  const canSave = errorKey === null && trimmed !== savedName.trim();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    if (!canSave) return;
    void setProfile(
      { displayName: trimmed },
      {
        saved: t("profile.toasts.saved"),
        failure: {
          title: t("writeFailed.profileName.title"),
          description: t("writeFailed.profileName.description"),
        },
      },
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
          {t("profile.save")}
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

export function ProfileView() {
  const { t } = useTranslation("settings");
  const { data: profile } = useMyEditableProfile();
  const me = useMyProfile();
  const savedName = profile?.displayName ?? me?.name ?? "";

  return (
    <AccountPage title={t("profile.title")} subtitle={t("profile.subtitle")}>
      {profile && (
        <SettingsCard>
          <ProfilePhotoRow displayName={savedName} />
          <ProfileNameForm key={savedName} savedName={savedName} />
        </SettingsCard>
      )}
    </AccountPage>
  );
}
