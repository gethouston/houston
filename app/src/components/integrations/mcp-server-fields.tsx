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
import { Field } from "./custom-integration-field-parts";
import type {
  McpAuthMode,
  McpFieldError,
  McpFormValues,
} from "./mcp-server-model";

interface FieldsProps {
  values: McpFormValues;
  set: (patch: Partial<McpFormValues>) => void;
  errorField: McpFieldError | null;
  /** Edit mode offers "keep current auth" and blanks the URL / secret fields. */
  mode: "create" | "edit";
  disabled: boolean;
}

/**
 * The presentational field rows of the MCP-server form (create + edit): name,
 * server URL, auth mode (none / bearer / custom header, plus "keep" in edit),
 * the header name (custom-header only), the secret (password with reveal), and
 * the agent-facing description. Dumb and props-driven; the parent form owns
 * state, validation, and submission. Reuses the shared `Field` row.
 */
export function McpServerFields({
  values,
  set,
  errorField,
  mode,
  disabled,
}: FieldsProps) {
  const { t } = useTranslation("integrations");
  const [showSecret, setShowSecret] = useState(false);
  const isEdit = mode === "edit";
  const err = (field: McpFieldError) =>
    errorField === field ? t(`mcp.errors.${field}`) : null;
  const needsSecret =
    values.authMode === "bearer" || values.authMode === "header";

  return (
    <div className="space-y-4">
      <Field id="mcp-name" label={t("mcp.name")} error={err("name")}>
        <Input
          id="mcp-name"
          value={values.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder={t("mcp.namePlaceholder")}
          disabled={disabled}
        />
      </Field>

      <Field
        id="mcp-url"
        label={t("mcp.url")}
        help={isEdit ? t("mcp.urlKeep") : undefined}
        error={err("url")}
      >
        <Input
          id="mcp-url"
          inputMode="url"
          value={values.url}
          onChange={(e) => set({ url: e.target.value })}
          placeholder={t("mcp.urlPlaceholder")}
          className="font-mono"
          disabled={disabled}
        />
      </Field>

      <Field id="mcp-auth-type" label={t("mcp.authType")}>
        <Select
          value={values.authMode}
          onValueChange={(v) => set({ authMode: v as McpAuthMode })}
          disabled={disabled}
        >
          <SelectTrigger id="mcp-auth-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {isEdit && (
              <SelectItem value="keep">{t("mcp.authKeep")}</SelectItem>
            )}
            <SelectItem value="none">{t("mcp.authNone")}</SelectItem>
            <SelectItem value="bearer">{t("mcp.authBearer")}</SelectItem>
            <SelectItem value="header">{t("mcp.authHeader")}</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {values.authMode === "header" && (
        <Field
          id="mcp-header"
          label={t("mcp.authHeaderName")}
          error={err("authHeader")}
        >
          <Input
            id="mcp-header"
            value={values.headerName}
            onChange={(e) => set({ headerName: e.target.value })}
            placeholder={t("mcp.authHeaderNamePlaceholder")}
            className="font-mono"
            disabled={disabled}
          />
        </Field>
      )}

      {needsSecret && (
        <Field
          id="mcp-secret"
          label={t("mcp.secret")}
          help={isEdit ? t("mcp.secretKeep") : undefined}
          error={err("authValue")}
        >
          <div className="relative">
            <Input
              id="mcp-secret"
              type={showSecret ? "text" : "password"}
              autoComplete="off"
              value={values.authValue}
              onChange={(e) => set({ authValue: e.target.value })}
              placeholder={t("mcp.secretPlaceholder")}
              className="pr-10 font-mono"
              disabled={disabled}
            />
            <button
              type="button"
              onClick={() => setShowSecret((s) => !s)}
              aria-label={showSecret ? t("mcp.hide") : t("mcp.show")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {showSecret ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
        </Field>
      )}

      <Field
        id="mcp-description"
        label={t("mcp.description")}
        help={t("mcp.descriptionHint")}
        error={err("description")}
      >
        <Textarea
          id="mcp-description"
          value={values.description}
          onChange={(e) => set({ description: e.target.value })}
          placeholder={t("mcp.descriptionPlaceholder")}
          rows={3}
          disabled={disabled}
        />
      </Field>
    </div>
  );
}
