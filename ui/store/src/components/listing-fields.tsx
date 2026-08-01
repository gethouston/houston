"use client";

import { Badge, Input } from "@houston-ai/core";
import { X } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useState } from "react";

import { normalizeListingTags } from "./edit-listing-model";

/**
 * Field primitives for the Edit-listing dialog: a labelled field wrapper and
 * the tag editor (chip list plus Enter/comma-to-add input, same trim/de-dupe/
 * cap rules as the publish wizard via `normalizeListingTags`).
 */

export function LabelledField({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="font-medium text-sm">
          {label}
        </label>
        {hint && <span className="text-ink-muted text-xs">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function TagsInput({
  id,
  tags,
  onChange,
  placeholder,
  removeLabel,
}: {
  id: string;
  tags: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  /** Accessible label for a chip's remove button. */
  removeLabel: (tag: string) => string;
}) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    onChange(normalizeListingTags([...tags, draft]));
    setDraft("");
  };
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      if (draft.trim()) commit();
    } else if (event.key === "Backspace" && !draft && tags.length) {
      onChange(tags.slice(0, -1));
    }
  };

  return (
    <div>
      {tags.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1 pr-1">
              {tag}
              <button
                type="button"
                aria-label={removeLabel(tag)}
                onClick={() => onChange(tags.filter((x) => x !== tag))}
                className="rounded-full p-0.5 hover:bg-ink/10"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Input
        id={id}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKey}
        onBlur={() => {
          if (draft.trim()) commit();
        }}
        placeholder={placeholder}
      />
    </div>
  );
}
