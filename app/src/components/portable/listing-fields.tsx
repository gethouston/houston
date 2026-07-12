/**
 * Field primitives for the publish listing step: a labelled field wrapper and
 * the tag editor (chip list plus Enter/comma-to-add input). Kept beside the
 * step so the step file stays focused on the form's shape.
 */

import { Badge, Input } from "@houston-ai/core";
import { X } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { MAX_TAGS, normalizeTags } from "../../lib/portable-share";

export function Field({
  htmlFor,
  label,
  hint,
  required,
  children,
}: {
  htmlFor: string;
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation("portable");
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor={htmlFor}
          className="text-sm font-medium text-foreground"
        >
          {label}
          {required && (
            <span className="ml-1 text-muted-foreground">
              {t("publish.listing.requiredMark")}
            </span>
          )}
        </label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function TagsEditor({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (next: string[]) => void;
}) {
  const { t } = useTranslation("portable");
  const [draft, setDraft] = useState("");

  const commit = () => {
    onChange(normalizeTags([...tags, draft]));
    setDraft("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (draft.trim()) commit();
    } else if (e.key === "Backspace" && !draft && tags.length) {
      onChange(tags.slice(0, -1));
    }
  };
  const remove = (tag: string) => onChange(tags.filter((x) => x !== tag));

  return (
    <Field
      htmlFor="listing-tags"
      label={t("publish.listing.tagsLabel")}
      hint={t("publish.listing.tagsHint", { max: MAX_TAGS })}
    >
      {tags.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1 pr-1">
              {tag}
              <button
                type="button"
                aria-label={t("publish.listing.removeTag", { tag })}
                onClick={() => remove(tag)}
                className="rounded-full p-0.5 hover:bg-foreground/10"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Input
        id="listing-tags"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => draft.trim() && commit()}
        disabled={tags.length >= MAX_TAGS}
        placeholder={
          tags.length >= MAX_TAGS
            ? t("publish.listing.tagsFull")
            : t("publish.listing.tagsPlaceholder")
        }
      />
    </Field>
  );
}
