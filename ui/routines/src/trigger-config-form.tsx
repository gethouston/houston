/**
 * TriggerConfigForm — the per-trigger settings form, generated from the trigger
 * type's `config` JSON schema (C9). Strings, numbers, booleans and enums render
 * as proper labeled fields with required-field validation; a schema this app
 * can't model degrades the whole form to a single labeled JSON textarea (last
 * resort). Purely presentational: the schema→fields work is the pure mapper in
 * `trigger-config-schema.ts`; copy arrives via `labels`.
 *
 * Emits `onChange(values, valid)` on every edit — `valid` folds required-field
 * checks (structured) or JSON parse-ability (fallback) so the editor can gate
 * Save without re-deriving the schema.
 */
import {
  cn,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "@houston-ai/core";
import { useState } from "react";
import { DEFAULT_TRIGGER_LABELS, type TriggerLabels } from "./labels";
import {
  coerceConfigValue,
  missingRequired,
  parseTriggerConfigSchema,
  type TriggerConfigField,
} from "./trigger-config-schema";

export interface TriggerConfigFormProps {
  /** The chosen trigger type's `config` JSON schema. */
  schema: Record<string, unknown>;
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>, valid: boolean) => void;
  labels?: TriggerLabels;
}

const FIELD_CLASS = cn(
  "w-full px-3 py-2 text-sm text-foreground",
  "bg-background border border-foreground/[0.08] rounded-lg",
  "outline-none transition-shadow duration-200",
  "focus:shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
);

export function TriggerConfigForm({
  schema,
  values,
  onChange,
  labels = DEFAULT_TRIGGER_LABELS,
}: TriggerConfigFormProps) {
  const parsed = parseTriggerConfigSchema(schema);

  if (!parsed.supported) {
    return <RawJsonField values={values} onChange={onChange} labels={labels} />;
  }
  if (parsed.fields.length === 0) return null;

  const emit = (
    key: string,
    kind: TriggerConfigField["kind"],
    raw: unknown,
  ) => {
    const next = { ...values, [key]: coerceConfigValue(kind, raw) };
    onChange(next, missingRequired(parsed.fields, next).length === 0);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-muted-foreground">
        {labels.detailsTitle}
      </p>
      {parsed.fields.map((field) => (
        <ConfigField
          key={field.key}
          field={field}
          value={values[field.key]}
          onChange={(raw) => emit(field.key, field.kind, raw)}
        />
      ))}
    </div>
  );
}

function ConfigField({
  field,
  value,
  onChange,
}: {
  field: TriggerConfigField;
  value: unknown;
  onChange: (raw: unknown) => void;
}) {
  if (field.kind === "boolean") {
    return (
      <div className="flex items-center justify-between gap-3">
        <FieldHeader field={field} inline />
        <Switch
          checked={value === true}
          onCheckedChange={(checked) => onChange(checked)}
          aria-label={field.label}
        />
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <FieldHeader field={field} />
      {field.kind === "enum" ? (
        <Select
          value={value === undefined ? undefined : String(value)}
          onValueChange={onChange}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          type={field.kind === "number" ? "number" : "text"}
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

function FieldHeader({
  field,
  inline = false,
}: {
  field: TriggerConfigField;
  inline?: boolean;
}) {
  return (
    <div className={cn(inline && "min-w-0")}>
      <p className="text-xs font-medium text-foreground">{field.label}</p>
      {field.description && (
        <p className="text-xs text-muted-foreground mt-0.5">
          {field.description}
        </p>
      )}
    </div>
  );
}

/** Last-resort editor for a config schema we can't model as fields. */
function RawJsonField({
  values,
  onChange,
  labels,
}: {
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>, valid: boolean) => void;
  labels: TriggerLabels;
}) {
  const [raw, setRaw] = useState(() => JSON.stringify(values ?? {}, null, 2));
  const [invalid, setInvalid] = useState(false);

  const handle = (text: string) => {
    setRaw(text);
    try {
      const parsed = JSON.parse(text || "{}");
      const ok =
        typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
      setInvalid(!ok);
      onChange(ok ? (parsed as Record<string, unknown>) : values, ok);
    } catch {
      setInvalid(true);
      onChange(values, false);
    }
  };

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-foreground">
        {labels.rawJsonLabel}
      </p>
      <p className="text-xs text-muted-foreground">{labels.rawJsonHint}</p>
      <Textarea
        value={raw}
        onChange={(e) => handle(e.target.value)}
        rows={5}
        spellCheck={false}
        className={cn(FIELD_CLASS, "font-mono resize-none")}
      />
      {invalid && (
        <p className="text-xs text-destructive">{labels.rawJsonInvalid}</p>
      )}
    </div>
  );
}
