"use client";

import type { CreatorLinks } from "@houston/agentstore-client";
import { Input } from "@houston-ai/core";

/** The fixed, ordered social keys with their labels and placeholders. */
const FIELDS: ReadonlyArray<{
  key: keyof CreatorLinks;
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

export interface ProfileSocialsProps {
  links: CreatorLinks;
  onChange: (links: CreatorLinks) => void;
}

/**
 * The social/web links editor: one https input per known key. An emptied field is
 * removed from the object so the saved profile carries only present links (the
 * gateway rejects a non-https or over-length value with `invalid_link`).
 */
export function ProfileSocials({ links, onChange }: ProfileSocialsProps) {
  function set(key: keyof CreatorLinks, value: string) {
    const next = { ...links };
    if (value.trim()) next[key] = value.trim();
    else delete next[key];
    onChange(next);
  }

  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="text-sm font-medium">Social links</legend>
      <p className="-mt-2 text-xs text-muted-foreground">
        Optional. Each link must start with https://
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {FIELDS.map(({ key, label, placeholder }) => (
          <div key={key} className="flex flex-col gap-1.5">
            <label htmlFor={`social-${key}`} className="text-xs font-medium">
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
