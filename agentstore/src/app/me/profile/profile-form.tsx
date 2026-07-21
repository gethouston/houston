"use client";

import type { CreatorLinks } from "@houston/agentstore-client";
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
import type * as React from "react";
import { HandleField } from "./handle-field";
import { ProfileAvatar } from "./profile-avatar";
import { ProfileSocials } from "./profile-socials";

/** The editable form fields, seeded from the loaded profile (or blank to claim). */
export interface Form {
  handle: string;
  displayName: string;
  bio: string;
  links: CreatorLinks;
}

export interface ProfileFormProps {
  form: Form;
  onFormChange: (patch: Partial<Form>) => void;
  /** True when the caller has no profile yet (claim flow vs. edit flow). */
  claiming: boolean;
  saving: boolean;
  saved: boolean;
  error: string | null;
  avatarUrl: string | null;
  onAvatarChange: (avatarUrl: string | null) => void;
  getToken: () => Promise<string | null>;
  /** The profile's current handle, always available to its owner. */
  currentHandle: string | null;
  onSubmit: (event: React.FormEvent) => void;
}

/**
 * The creator-profile form: handle, display name, bio, avatar, and socials, plus
 * the save button and inline success/error banners. Presentational — all state
 * and persistence live in `ProfileClient`.
 */
export function ProfileForm({
  form,
  onFormChange,
  claiming,
  saving,
  saved,
  error,
  avatarUrl,
  onAvatarChange,
  getToken,
  currentHandle,
  onSubmit,
}: ProfileFormProps) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          {claiming ? "Claim your handle" : "Edit your profile"}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {claiming
            ? "Pick a handle and a display name to create your public creator page."
            : "Update how you appear across the store."}
        </p>
      </header>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden />
          <AlertTitle>That did not work</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {saved && (
        <Alert>
          <Check aria-hidden />
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription>Your profile is up to date.</AlertDescription>
        </Alert>
      )}

      <HandleField
        value={form.handle}
        onChange={(handle) => onFormChange({ handle })}
        getToken={getToken}
        currentHandle={currentHandle}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="profile-name" className="text-sm font-medium">
          Display name
        </label>
        <Input
          id="profile-name"
          value={form.displayName}
          onChange={(e) => onFormChange({ displayName: e.target.value })}
          maxLength={80}
          placeholder="Your name or brand"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="profile-bio" className="text-sm font-medium">
          Bio <span className="text-muted-foreground">(optional)</span>
        </label>
        <Textarea
          id="profile-bio"
          value={form.bio}
          onChange={(e) => onFormChange({ bio: e.target.value })}
          maxLength={500}
          rows={4}
          placeholder="Tell people what you build."
        />
      </div>

      <ProfileAvatar
        avatarUrl={avatarUrl}
        displayName={form.displayName || form.handle}
        getToken={getToken}
        enabled={!claiming}
        onChange={onAvatarChange}
      />

      <ProfileSocials
        links={form.links}
        onChange={(links) => onFormChange({ links })}
      />

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={saving}>
          {saving && <Spinner className="size-4" />}
          {claiming ? "Create profile" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
