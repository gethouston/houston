import type {
  CustomAuthField,
  CustomAuthMethod,
} from "@houston/engine-adapter";
import { Button, Input } from "@houston-ai/core";
import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

interface CustomCredentialFormProps {
  authMethod: CustomAuthMethod | null;
  submitting: boolean;
  onSubmit: (values: Record<string, string>) => void;
  submitLabel: string;
  submittingLabel: string;
  autoFocus?: boolean;
  formId?: string;
  hideSubmit?: boolean;
  onReadyChange?: (ready: boolean) => void;
}

function fallbackFields(label: string): CustomAuthField[] {
  return [{ variable: "token", label }];
}

function allFilled(
  fields: CustomAuthField[],
  values: Record<string, string>,
): boolean {
  return fields.every((f) => (values[f.variable] ?? "").trim().length > 0);
}

export function CustomCredentialForm({
  authMethod,
  submitting,
  onSubmit,
  submitLabel,
  submittingLabel,
  autoFocus,
  formId,
  hideSubmit,
  onReadyChange,
}: CustomCredentialFormProps) {
  const { t } = useTranslation("integrations");
  const [values, setValues] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const fields =
    authMethod && authMethod.fields.length > 0
      ? authMethod.fields
      : fallbackFields(t("custom.credential.apiKeyLabel"));
  const ready = allFilled(fields, values);

  useEffect(() => {
    onReadyChange?.(ready);
  }, [ready, onReadyChange]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || submitting) return;
    const trimmed: Record<string, string> = {};
    for (const f of fields)
      trimmed[f.variable] = (values[f.variable] ?? "").trim();
    onSubmit(trimmed);
  };

  return (
    <form id={formId} onSubmit={submit} className="flex flex-col gap-3">
      {fields.map((field, i) => {
        const show = revealed[field.variable] ?? false;
        return (
          <div key={field.variable} className="space-y-1.5">
            <label
              htmlFor={`ci-${field.variable}`}
              className="text-[13px] font-medium text-ink"
            >
              {field.label}
            </label>
            <div className="relative">
              <Input
                id={`ci-${field.variable}`}
                type={show ? "text" : "password"}
                autoComplete="off"
                autoFocus={autoFocus && i === 0}
                value={values[field.variable] ?? ""}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [field.variable]: e.target.value }))
                }
                placeholder={t("custom.credential.placeholder")}
                disabled={submitting}
                className="pr-10 font-mono text-[13px]"
              />
              <button
                type="button"
                onClick={() =>
                  setRevealed((r) => ({
                    ...r,
                    [field.variable]: !show,
                  }))
                }
                aria-label={
                  show
                    ? t("custom.credential.hide")
                    : t("custom.credential.show")
                }
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded text-ink-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                {show ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
          </div>
        );
      })}
      {!hideSubmit && (
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={!ready || submitting}>
            {submitting ? submittingLabel : submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}
