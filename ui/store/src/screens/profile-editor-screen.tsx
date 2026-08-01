"use client";

import { normalizeHandle } from "@houston/agentstore-contract";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Input,
  Spinner,
  Textarea,
} from "@houston-ai/core";
import { AlertTriangle, Check } from "lucide-react";
import { type FormEvent, useState } from "react";

import {
  type HandleAvailability,
  HandleField,
  type HandleFieldLabels,
} from "../components/handle-field";
import {
  ProfileAvatar,
  type ProfileAvatarLabels,
} from "../components/profile-editor-parts";
import {
  ProfileSocials,
  type ProfileSocialsLabels,
} from "../components/profile-socials";
import {
  PROFILE_EDITOR_LABELS,
  type ProfileEditorForm,
  type ProfileEditorLabels,
  type ProfileEditorPatch,
  SAVE_ERROR,
} from "./profile-editor-model";

export interface ProfileEditorScreenProps {
  /** The loaded profile fields, or null when claiming for the first time. */
  initial: (ProfileEditorForm & { avatarUrl: string | null }) | null;
  currentHandle: string | null;
  /** Persist edits; resolve with the saved profile, reject with an Error that
   *  may carry a gateway `code` for the shared copy map. */
  onSave: (
    patch: ProfileEditorPatch,
  ) => Promise<ProfileEditorForm & { avatarUrl: string | null }>;
  checkHandle: (handle: string) => Promise<HandleAvailability>;
  uploadAvatar: (file: File) => Promise<{ avatarUrl: string }>;
  deleteAvatar: () => Promise<void>;
  labels?: Partial<ProfileEditorLabels>;
  handleLabels?: Partial<HandleFieldLabels>;
  avatarLabels?: Partial<ProfileAvatarLabels>;
  socialsLabels?: Partial<ProfileSocialsLabels>;
}

function toForm(
  initial: ProfileEditorScreenProps["initial"],
): ProfileEditorForm {
  return {
    handle: initial?.handle ?? "",
    displayName: initial?.displayName ?? "",
    bio: initial?.bio ?? "",
    links: initial?.links ?? {},
  };
}

/**
 * THE creator-profile editor — handle claim with live availability, name,
 * bio, avatar, socials, save. Composition and copy are fixed here so web and
 * app cannot drift; surfaces inject persistence and translations only.
 */
export function ProfileEditorScreen(props: ProfileEditorScreenProps) {
  const labels = { ...PROFILE_EDITOR_LABELS, ...props.labels };
  const [form, setForm] = useState<ProfileEditorForm>(() =>
    toForm(props.initial),
  );
  const [avatarUrl, setAvatarUrl] = useState(props.initial?.avatarUrl ?? null);
  const [claiming, setClaiming] = useState(props.initial === null);
  const [currentHandle, setCurrentHandle] = useState(props.currentHandle);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const patch = (next: Partial<ProfileEditorForm>) =>
    setForm((f) => ({ ...f, ...next }));

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const savedProfile = await props.onSave({
        handle: normalizeHandle(form.handle),
        displayName: form.displayName.trim(),
        bio: form.bio.trim(),
        links: form.links,
      });
      setForm(toForm(savedProfile));
      setAvatarUrl(savedProfile.avatarUrl);
      setCurrentHandle(savedProfile.handle || null);
      setClaiming(false);
      setSaved(true);
    } catch (err) {
      const code = (err as { code?: string }).code;
      setError(
        (code && SAVE_ERROR[code]) ??
          (err instanceof Error && err.message
            ? err.message
            : labels.networkFailed),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-8">
      <header>
        <h1 className="font-semibold text-3xl tracking-tight">
          {claiming ? labels.claimTitle : labels.editTitle}
        </h1>
        <p className="mt-2 text-ink-muted">
          {claiming ? labels.claimIntro : labels.editIntro}
        </p>
      </header>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden />
          <AlertTitle>{labels.errorTitle}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {saved && (
        <Alert>
          <Check aria-hidden />
          <AlertTitle>{labels.savedTitle}</AlertTitle>
          <AlertDescription>{labels.savedBody}</AlertDescription>
        </Alert>
      )}

      <HandleField
        value={form.handle}
        onChange={(handle) => patch({ handle })}
        checkHandle={props.checkHandle}
        currentHandle={currentHandle}
        labels={props.handleLabels}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="profile-name" className="font-medium text-sm">
          {labels.nameLabel}{" "}
          <span className="text-ink-muted">{labels.optional}</span>
        </label>
        <Input
          id="profile-name"
          value={form.displayName}
          onChange={(e) => patch({ displayName: e.target.value })}
          maxLength={80}
          placeholder={labels.namePlaceholder}
        />
        <p className="text-ink-muted text-sm">{labels.nameHint}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="profile-bio" className="font-medium text-sm">
          {labels.bioLabel}{" "}
          <span className="text-ink-muted">{labels.optional}</span>
        </label>
        <Textarea
          id="profile-bio"
          value={form.bio}
          onChange={(e) => patch({ bio: e.target.value })}
          maxLength={500}
          rows={4}
          placeholder={labels.bioPlaceholder}
        />
      </div>

      <ProfileAvatar
        avatarUrl={avatarUrl}
        displayName={form.displayName || form.handle}
        enabled={!claiming}
        onChange={setAvatarUrl}
        uploadAvatar={props.uploadAvatar}
        deleteAvatar={props.deleteAvatar}
        labels={props.avatarLabels}
      />

      <ProfileSocials
        links={form.links}
        onChange={(links) => patch({ links })}
        labels={props.socialsLabels}
      />

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={saving}>
          {saving && <Spinner className="size-4" />}
          {claiming ? labels.create : labels.save}
        </Button>
      </div>
    </form>
  );
}
