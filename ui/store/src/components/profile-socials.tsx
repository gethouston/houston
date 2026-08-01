"use client";

import { Input } from "@houston-ai/core";

import type { CreatorLinkKey, CreatorLinkMap } from "./social-links";

/** The fixed, ordered social keys with their labels and placeholders. */
const SOCIAL_FIELDS: ReadonlyArray<{
  key: CreatorLinkKey;
  label: string;
  placeholder: string;
}> = [
  { key: "x", label: "X", placeholder: "https://x.com/yourname" },
  {
    key: "youtube",
    label: "YouTube",
    placeholder: "https://youtube.com/@yourname",
  },
  {
    key: "tiktok",
    label: "TikTok",
    placeholder: "https://tiktok.com/@yourname",
  },
  {
    key: "instagram",
    label: "Instagram",
    placeholder: "https://instagram.com/yourname",
  },
  {
    key: "github",
    label: "GitHub",
    placeholder: "https://github.com/yourname",
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    placeholder: "https://linkedin.com/in/yourname",
  },
  { key: "website", label: "Website", placeholder: "https://yoursite.com" },
];

export interface ProfileSocialsLabels {
  legend: string;
  hint: string;
}

export const PROFILE_SOCIALS_LABELS: ProfileSocialsLabels = {
  legend: "Social links",
  hint: "Optional. Each link must start with https://",
};

/**
 * The social/web links editor: one https input per known key. An emptied field
 * is removed so the saved profile carries only present links.
 */
export function ProfileSocials({
  links,
  onChange,
  labels: overrides,
}: {
  links: CreatorLinkMap;
  onChange: (links: CreatorLinkMap) => void;
  labels?: Partial<ProfileSocialsLabels>;
}) {
  const labels = { ...PROFILE_SOCIALS_LABELS, ...overrides };
  function set(key: CreatorLinkKey, value: string) {
    const next = { ...links };
    if (value.trim()) next[key] = value.trim();
    else delete next[key];
    onChange(next);
  }
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="font-medium text-sm">{labels.legend}</legend>
      <p className="-mt-2 text-ink-muted text-xs">{labels.hint}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SOCIAL_FIELDS.map(({ key, label, placeholder }) => (
          <div key={key} className="flex flex-col gap-1.5">
            <label htmlFor={`social-${key}`} className="font-medium text-xs">
              {label}
            </label>
            <Input
              id={`social-${key}`}
              type="url"
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              value={links[key] ?? ""}
              onChange={(e) => set(key, e.target.value)}
              placeholder={placeholder}
            />
          </div>
        ))}
      </div>
    </fieldset>
  );
}
