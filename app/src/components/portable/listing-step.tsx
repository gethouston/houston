/**
 * The publish listing step: the store-facing metadata the creator fills in
 * before an agent is listed. Description + category + creator name are
 * required; tagline, tags and creator link are optional.
 */

import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { ListingForm } from "../../lib/portable-share";
import {
  STORE_CATEGORIES,
  storeCategoryLabelKey,
} from "../../lib/store-categories";
import { CreatorIdentityField } from "./creator-identity-field";
import { Field, TagsEditor } from "./listing-fields";

export function ListingStep({
  agentName,
  value,
  onChange,
}: {
  agentName: string;
  value: ListingForm;
  onChange: (next: ListingForm) => void;
}) {
  const { t } = useTranslation("portable");

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-[28px] font-normal leading-tight">
          {t("publish.listing.title", { name: agentName })}
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          {t("publish.listing.body")}
        </p>
      </header>

      <Field
        htmlFor="listing-description"
        label={t("publish.listing.descriptionLabel")}
        required
      >
        <Textarea
          id="listing-description"
          value={value.description}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
          placeholder={t("publish.listing.descriptionPlaceholder")}
          className="min-h-24"
        />
      </Field>

      <Field
        htmlFor="listing-tagline"
        label={t("publish.listing.taglineLabel")}
      >
        <Input
          id="listing-tagline"
          value={value.tagline}
          onChange={(e) => onChange({ ...value, tagline: e.target.value })}
          placeholder={t("publish.listing.taglinePlaceholder")}
        />
      </Field>

      <Field
        htmlFor="listing-category"
        label={t("publish.listing.categoryLabel")}
        required
      >
        <Select
          value={value.category || undefined}
          onValueChange={(category) => onChange({ ...value, category })}
        >
          <SelectTrigger id="listing-category" className="w-full">
            <SelectValue
              placeholder={t("publish.listing.categoryPlaceholder")}
            />
          </SelectTrigger>
          <SelectContent>
            {STORE_CATEGORIES.map((slug) => (
              <SelectItem key={slug} value={slug}>
                {t(storeCategoryLabelKey(slug))}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <TagsEditor
        tags={value.tags}
        onChange={(tags) => onChange({ ...value, tags })}
      />

      <CreatorIdentityField value={value} onChange={onChange} />
    </div>
  );
}
