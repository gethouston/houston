import { Button } from "@houston-ai/core";
import type {
  CustomAuthField,
  CustomAuthMethod,
} from "@houston-ai/engine-client";
import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

interface CustomCredentialFormProps {
  /** The declared auth method whose fields to collect, or `null` before the
   *  integration lookup resolves — then a single "API key" (`token`) field is
   *  shown so the user is never blocked waiting on the list. */
  authMethod: CustomAuthMethod | null;
  submitting: boolean;
  /** The parent wires this to the credential mutation; keys are field variables.
   *  Secrets cross ONLY here (HTTPS body), never the chat transcript. */
  onSubmit: (values: Record<string, string>) => void;
  submitLabel: string;
  submittingLabel: string;
  autoFocus?: boolean;
  /** DOM id on the `<form>`, so an EXTERNAL submit button (`type="submit"
   *  form={formId}`) can drive it — the in-chat card puts Save in the shared
   *  modal footer instead of inside the field block. */
  formId?: string;
  /** Hide the form's own trailing Save button (the dialog keeps it; the in-chat
   *  card supplies its own footer CTA). Enter in a field still submits. */
  hideSubmit?: boolean;
  /** Reports whether every field is filled, so an external footer button can
   *  gate its own disabled state (mirrors the internal Save button's gating). */
  onReadyChange?: (ready: boolean) => void;
}

/** The fallback single-field method used until the integration's real auth
 *  method is known (its one field keyed `token`, matching the backend's default). */
function fallbackFields(label: string): CustomAuthField[] {
  return [{ variable: "token", label }];
}

/** Every field has a non-empty trimmed value. */
function allFilled(
  fields: CustomAuthField[],
  values: Record<string, string>,
): boolean {
  return fields.every((f) => (values[f.variable] ?? "").trim().length > 0);
}

/**
 * The secure key-entry form shared by the in-chat credential card and the
 * Integrations-page "Enter key" dialog: one password input per declared field
 * (revealable), and a Save button gated until every field is filled. It holds no
 * mutation of its own — the parent owns submission (and thus the `call()` toast
 * on failure), so this stays a controlled, presentational form.
 */
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

  // Let an external footer button mirror the internal Save button's gating.
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
              <input
                id={`ci-${field.variable}`}
                type={show ? "text" : "password"}
                autoComplete="off"
                // biome-ignore lint/a11y/noAutofocus: focus the first key field
                autoFocus={autoFocus && i === 0}
                value={values[field.variable] ?? ""}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [field.variable]: e.target.value }))
                }
                placeholder={t("custom.credential.placeholder")}
                disabled={submitting}
                className="w-full rounded-md border bg-input px-3 py-2 pr-10 font-mono text-[13px] focus:outline-none focus:ring-2 focus:ring-focus"
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
