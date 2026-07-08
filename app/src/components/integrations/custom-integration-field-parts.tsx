import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import {
  type CustomFieldError,
  type CustomFormValues,
  PREFIX_PRESETS,
  type PrefixPreset,
} from "./custom-integration-model";

/** One labeled field row with optional help + inline error. */
export function Field({
  id,
  label,
  help,
  error,
  children,
}: {
  id: string;
  label: string;
  help?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-foreground">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[12px] text-destructive" role="alert">
          {error}
        </p>
      ) : help ? (
        <p className="text-[12px] text-muted-foreground">{help}</p>
      ) : null}
    </div>
  );
}

/** The header-auth sub-fields: header name + a prefix preset (Bearer/none/custom). */
export function HeaderAuthFields({
  values,
  set,
  error,
  disabled,
}: {
  values: CustomFormValues;
  set: (patch: Partial<CustomFormValues>) => void;
  error: CustomFieldError | null;
  disabled: boolean;
}) {
  const { t } = useTranslation("integrations");
  const err = (field: CustomFieldError) =>
    error === field ? t(`custom.errors.${field}`) : null;
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field
        id="cust-header"
        label={t("custom.authHeader")}
        error={err("authField")}
      >
        <Input
          id="cust-header"
          value={values.headerName}
          onChange={(e) => set({ headerName: e.target.value })}
          placeholder={t("custom.authHeaderPlaceholder")}
          className="font-mono"
          disabled={disabled}
        />
      </Field>
      <Field
        id="cust-prefix"
        label={t("custom.authPrefix")}
        error={err("authPrefix")}
      >
        <Select
          value={values.prefixPreset}
          onValueChange={(v) => set({ prefixPreset: v as PrefixPreset })}
          disabled={disabled}
        >
          <SelectTrigger id="cust-prefix">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PREFIX_PRESETS.map((p) => (
              <SelectItem key={p} value={p}>
                {t(`custom.prefix_${p}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {values.prefixPreset === "custom" && (
          <Input
            value={values.customPrefix}
            onChange={(e) => set({ customPrefix: e.target.value })}
            placeholder={t("custom.authPrefixPlaceholder")}
            className="mt-2 font-mono"
            disabled={disabled}
          />
        )}
      </Field>
    </div>
  );
}
