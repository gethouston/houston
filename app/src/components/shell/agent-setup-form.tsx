import { useTranslation } from "react-i18next";
import { Switch, cn } from "@houston-ai/core";
import { FOCUS_LABELS, TRAIT_LABELS } from "./agent-setup-utils";

export interface AgentSetupFormValues {
  focus: string;
  traits: string[];
  verbosity: number;
  askFirst: boolean;
  extra: string;
}

interface AgentSetupFormProps {
  values: AgentSetupFormValues;
  onChange: (values: AgentSetupFormValues) => void;
  disabled?: boolean;
}

// Derived from the label maps — single source of truth for ordering and slugs.
const FOCUS_KEYS = Object.keys(FOCUS_LABELS);
const TRAIT_KEYS = Object.keys(TRAIT_LABELS);
const MAX_TRAITS = 3;

export function AgentSetupForm({
  values,
  onChange,
  disabled,
}: AgentSetupFormProps) {
  const { t } = useTranslation("shell");

  const setFocus = (focus: string) => onChange({ ...values, focus });

  const toggleTrait = (trait: string) => {
    const has = values.traits.includes(trait);
    if (has) {
      onChange({
        ...values,
        traits: values.traits.filter((tr) => tr !== trait),
      });
    } else if (values.traits.length < MAX_TRAITS) {
      onChange({ ...values, traits: [...values.traits, trait] });
    }
  };

  // verbosity is always 1–5 (clamped by slider min/max), key is always valid.
  const verbosityKey = `aiAssist.verbosity.${values.verbosity}` as Parameters<
    typeof t
  >[0];

  return (
    <div className="space-y-7">
      {/* Field 1 — Focus area */}
      <fieldset disabled={disabled} className="space-y-3">
        <legend className="text-sm font-medium">
          {t("aiAssist.form.focusLabel")}
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {FOCUS_KEYS.map((key) => {
            const active = values.focus === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFocus(key)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border bg-secondary hover:bg-accent text-foreground",
                  "disabled:pointer-events-none disabled:opacity-50",
                )}
              >
                {t(`aiAssist.focus.${key}` as Parameters<typeof t>[0])}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Field 2 — Traits */}
      <fieldset disabled={disabled} className="space-y-3">
        <legend className="text-sm font-medium">
          {t("aiAssist.form.traitsLabel")}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {t("aiAssist.form.traitsHint", {
              selected: values.traits.length,
              max: MAX_TRAITS,
            })}
          </span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {TRAIT_KEYS.map((key) => {
            const active = values.traits.includes(key);
            const maxed = values.traits.length >= MAX_TRAITS && !active;
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleTrait(key)}
                disabled={maxed}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border bg-secondary text-foreground hover:bg-accent",
                  "disabled:pointer-events-none disabled:opacity-40",
                )}
              >
                {t(`aiAssist.traits.${key}` as Parameters<typeof t>[0])}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Field 3 — Verbosity */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label htmlFor="verbosity-slider" className="text-sm font-medium">
            {t("aiAssist.form.verbosityLabel")}
          </label>
          <span className="text-xs text-muted-foreground">
            {t(verbosityKey)}
          </span>
        </div>
        <input
          id="verbosity-slider"
          type="range"
          min={1}
          max={5}
          step={1}
          value={values.verbosity}
          disabled={disabled}
          onChange={(e) =>
            onChange({ ...values, verbosity: Number(e.target.value) })
          }
          className={cn(
            "w-full h-1.5 appearance-none rounded-full bg-secondary",
            "accent-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
          )}
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{t("aiAssist.form.verbosityMin")}</span>
          <span>{t("aiAssist.form.verbosityMax")}</span>
        </div>
      </div>

      {/* Field 4 — Ask first */}
      <div className="flex items-center justify-between gap-4">
        <div id="ask-first-label">
          <p className="text-sm font-medium">
            {t("aiAssist.form.askFirstLabel")}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("aiAssist.form.askFirstHint")}
          </p>
        </div>
        <Switch
          aria-labelledby="ask-first-label"
          checked={values.askFirst}
          onCheckedChange={(checked) =>
            onChange({ ...values, askFirst: checked })
          }
          disabled={disabled}
        />
      </div>

      {/* Field 5 — Extra instructions */}
      <div className="space-y-3">
        <label
          htmlFor="extra-instructions"
          className="block text-sm font-medium"
        >
          {t("aiAssist.form.extraLabel")}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {t("aiAssist.form.extraOptional")}
          </span>
        </label>
        <textarea
          id="extra-instructions"
          value={values.extra}
          onChange={(e) => onChange({ ...values, extra: e.target.value })}
          placeholder={t("aiAssist.form.extraPlaceholder")}
          rows={3}
          disabled={disabled}
          className={cn(
            "w-full px-4 py-3 text-sm text-foreground leading-relaxed",
            "placeholder:text-muted-foreground/60",
            "bg-secondary border border-black/[0.04] rounded-xl",
            "outline-none resize-none transition-shadow duration-200",
            "focus:shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
            "disabled:opacity-60 disabled:cursor-not-allowed",
          )}
        />
      </div>
    </div>
  );
}
