import { Input } from "@houston-ai/core";
import type { CreatorLinks } from "@houston-ai/engine-client";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { isValidHttpsUrl, SOCIAL_PLATFORMS } from "./profile-form";

/**
 * The seven social/web link inputs. Each is optional; a present value must be a
 * valid `https` URL (invalid ones show an inline error and, via
 * {@link hasInvalidLink}, disable the parent's Save). Clearing a field removes
 * its key entirely so the saved patch mirrors the gateway's `omitempty` shape.
 */
export function SocialsEditor({
  value,
  onChange,
  disabled,
}: {
  value: CreatorLinks;
  onChange: (links: CreatorLinks) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation("store");
  const groupId = useId();

  const setPlatform = (
    platform: (typeof SOCIAL_PLATFORMS)[number],
    raw: string,
  ) => {
    const next: CreatorLinks = { ...value };
    if (raw.trim()) next[platform] = raw;
    else delete next[platform];
    onChange(next);
  };

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-medium text-ink">
        {t("profile.socials.hint")}
      </legend>
      <div className="space-y-2">
        {SOCIAL_PLATFORMS.map((platform) => {
          const raw = value[platform] ?? "";
          const invalid = !isValidHttpsUrl(raw);
          const inputId = `${groupId}-${platform}`;
          return (
            <div
              key={platform}
              className="grid grid-cols-[6rem_1fr] items-center gap-2"
            >
              <label
                htmlFor={inputId}
                className="truncate text-sm text-ink-muted"
              >
                {t(`profile.socials.${platform}`)}
              </label>
              <Input
                id={inputId}
                type="url"
                inputMode="url"
                value={raw}
                aria-invalid={invalid}
                placeholder="https://"
                onChange={(e) => setPlatform(platform, e.target.value)}
              />
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
