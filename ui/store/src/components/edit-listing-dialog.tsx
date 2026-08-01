"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Textarea,
} from "@houston-ai/core";
import { useEffect, useState } from "react";

import type {
  OwnedAgentIdentity,
  OwnedAgentRow,
  StoreCategoryRow,
} from "../types";
import {
  EDIT_LISTING_DIALOG_LABELS,
  type EditListingDialogLabels,
  type ListingDraft,
  listingDraftOf,
  listingDraftValid,
  listingIdentityOf,
} from "./edit-listing-model";
import { LabelledField, TagsInput } from "./listing-fields";

export interface EditListingDialogProps {
  agent: OwnedAgentRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The store's category vocabulary, labelled by the surface. */
  categories: StoreCategoryRow[];
  /** Persist the edited identity; reject with an Error to surface its message. */
  onSave: (identity: OwnedAgentIdentity) => Promise<void>;
  labels?: Partial<EditListingDialogLabels>;
}

/**
 * THE listing editor — the store-facing metadata of an owned agent (name,
 * tagline, description, category, tags), saved as one `PATCH {identity}`.
 * One shared composition so web and app cannot drift. Content (skills,
 * instructions) is deliberately absent: it comes from the agent in Houston
 * via re-publish.
 */
export function EditListingDialog({
  agent,
  open,
  onOpenChange,
  categories,
  onSave,
  labels: overrides,
}: EditListingDialogProps) {
  const labels = { ...EDIT_LISTING_DIALOG_LABELS, ...overrides };
  const [draft, setDraft] = useState<ListingDraft>(() => listingDraftOf(agent));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed from the row each time the dialog opens, so a save-then-reopen
  // shows the server truth, not the last local draft.
  useEffect(() => {
    if (open) {
      setDraft(listingDraftOf(agent));
      setError(null);
    }
  }, [open, agent]);

  const set = (patch: Partial<ListingDraft>) =>
    setDraft((prev) => ({ ...prev, ...patch }));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(listingIdentityOf(draft));
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error && err.message ? err.message : labels.saveFailed,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{labels.title(agent.name)}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          <LabelledField id="listing-name" label={labels.nameLabel}>
            <Input
              id="listing-name"
              value={draft.name}
              onChange={(event) => set({ name: event.target.value })}
            />
          </LabelledField>
          <LabelledField
            id="listing-tagline"
            label={labels.taglineLabel}
            hint={labels.optional}
          >
            <Input
              id="listing-tagline"
              value={draft.tagline}
              onChange={(event) => set({ tagline: event.target.value })}
              placeholder={labels.taglinePlaceholder}
            />
          </LabelledField>
          <LabelledField
            id="listing-description"
            label={labels.descriptionLabel}
          >
            <Textarea
              id="listing-description"
              value={draft.description}
              onChange={(event) => set({ description: event.target.value })}
              className="min-h-24"
            />
          </LabelledField>
          <LabelledField id="listing-category" label={labels.categoryLabel}>
            <Select
              value={draft.category || undefined}
              onValueChange={(category) => set({ category })}
            >
              <SelectTrigger id="listing-category" className="w-full">
                <SelectValue placeholder={labels.categoryPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {categories.map((item) => (
                  <SelectItem key={item.slug} value={item.slug}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabelledField>
          <LabelledField
            id="listing-tags"
            label={labels.tagsLabel}
            hint={labels.optional}
          >
            <TagsInput
              id="listing-tags"
              tags={draft.tags}
              onChange={(tags) => set({ tags })}
              placeholder={labels.tagsPlaceholder}
              removeLabel={labels.removeTag}
            />
          </LabelledField>
          <p className="text-[13px] text-ink-muted">{labels.contentNote}</p>
          {error && (
            <p role="alert" className="text-danger text-[13px]">
              {error}
            </p>
          )}
          <Button
            type="button"
            className="w-full rounded-full"
            disabled={saving || !listingDraftValid(draft)}
            onClick={() => void save()}
          >
            {saving && <Spinner className="size-4" />}
            {labels.save}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
