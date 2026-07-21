import { Textarea } from "@houston-ai/core";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { MAX_BIO } from "./profile-form";

/**
 * The creator bio input: a plain multi-line field capped at {@link MAX_BIO}
 * characters with a live counter, so the gateway's `bio_too_long` can never be
 * reached from the UI. The `maxLength` hard-stops typing; the counter turns
 * `text-danger` at the ceiling as a quiet nudge.
 */
export function BioField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation("store");
  const id = useId();
  const atLimit = value.length >= MAX_BIO;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {t("profile.bioLabel")}
      </label>
      <Textarea
        id={id}
        value={value}
        maxLength={MAX_BIO}
        rows={3}
        placeholder={t("profile.bioPlaceholder")}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="resize-none"
      />
      <p
        className={`text-right text-xs ${atLimit ? "text-danger" : "text-ink-muted"}`}
      >
        {value.length}/{MAX_BIO}
      </p>
    </div>
  );
}
