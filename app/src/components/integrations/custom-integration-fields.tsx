import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@houston-ai/core";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Field, HeaderAuthFields } from "./custom-integration-field-parts";
import type {
  CustomAuthType,
  CustomFieldError,
  CustomFormValues,
} from "./custom-integration-model";

interface FieldsProps {
  values: CustomFormValues;
  set: (patch: Partial<CustomFormValues>) => void;
  errorField: CustomFieldError | null;
  /** Edit mode blanks secret/URL fields; hints say "leave blank to keep". */
  mode: "create" | "edit";
  disabled: boolean;
}

/**
 * The presentational field rows of the custom-integration form (create + edit):
 * name, base URL, auth scheme (header with prefix presets, or query param), API
 * key (password with reveal), and the agent-facing description. Dumb and
 * props-driven; the parent form owns state, validation, and submission.
 */
export function CustomIntegrationFields({
  values,
  set,
  errorField,
  mode,
  disabled,
}: FieldsProps) {
  const { t } = useTranslation("integrations");
  const [showKey, setShowKey] = useState(false);
  const isEdit = mode === "edit";
  const err = (field: CustomFieldError) =>
    errorField === field ? t(`custom.errors.${field}`) : null;

  return (
    <div className="space-y-4">
      <Field id="cust-name" label={t("custom.name")} error={err("name")}>
        <Input
          id="cust-name"
          value={values.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder={t("custom.namePlaceholder")}
          disabled={disabled}
        />
      </Field>

      <Field
        id="cust-base-url"
        label={t("custom.baseUrl")}
        help={isEdit ? t("custom.baseUrlKeep") : undefined}
        error={err("baseUrl")}
      >
        <Input
          id="cust-base-url"
          inputMode="url"
          value={values.baseUrl}
          onChange={(e) => set({ baseUrl: e.target.value })}
          placeholder={t("custom.baseUrlPlaceholder")}
          className="font-mono"
          disabled={disabled}
        />
      </Field>

      <Field id="cust-auth-type" label={t("custom.authType")}>
        <Select
          value={values.authType}
          onValueChange={(v) => set({ authType: v as CustomAuthType })}
          disabled={disabled}
        >
          <SelectTrigger id="cust-auth-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="header">{t("custom.authTypeHeader")}</SelectItem>
            <SelectItem value="query">{t("custom.authTypeQuery")}</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {values.authType === "header" ? (
        <HeaderAuthFields
          values={values}
          set={set}
          error={errorField}
          disabled={disabled}
        />
      ) : (
        <Field
          id="cust-query"
          label={t("custom.authQuery")}
          error={err("authField")}
        >
          <Input
            id="cust-query"
            value={values.queryParam}
            onChange={(e) => set({ queryParam: e.target.value })}
            placeholder={t("custom.authQueryPlaceholder")}
            className="font-mono"
            disabled={disabled}
          />
        </Field>
      )}

      <Field
        id="cust-api-key"
        label={t("custom.apiKey")}
        help={isEdit ? t("custom.apiKeyKeep") : undefined}
        error={err("apiKey")}
      >
        <div className="relative">
          <Input
            id="cust-api-key"
            type={showKey ? "text" : "password"}
            autoComplete="off"
            value={values.apiKey}
            onChange={(e) => set({ apiKey: e.target.value })}
            placeholder={t("custom.apiKeyPlaceholder")}
            className="pr-10 font-mono"
            disabled={disabled}
          />
          <button
            type="button"
            onClick={() => setShowKey((s) => !s)}
            aria-label={showKey ? t("custom.hide") : t("custom.show")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {showKey ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </button>
        </div>
      </Field>

      <Field
        id="cust-description"
        label={t("custom.description")}
        help={t("custom.descriptionHint")}
        error={err("description")}
      >
        <Textarea
          id="cust-description"
          value={values.description}
          onChange={(e) => set({ description: e.target.value })}
          placeholder={t("custom.descriptionPlaceholder")}
          rows={3}
          disabled={disabled}
        />
      </Field>
    </div>
  );
}
