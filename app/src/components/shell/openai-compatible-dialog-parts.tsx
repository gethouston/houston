import { Eye, EyeOff } from "lucide-react";

/**
 * Presentational field rows for {@link OpenAiCompatibleDialog}. Split out so the
 * dialog stays under the file-size budget; dumb, props-driven render helpers.
 */

/** A labeled text input with help text. */
export function LabeledTextField({
  id,
  label,
  help,
  value,
  onChange,
  placeholder,
  disabled,
  mono,
  inputMode,
}: {
  id: string;
  label: string;
  help: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
  mono?: boolean;
  inputMode?: "url";
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-[13px] font-medium">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode={inputMode}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-md border bg-background px-3 py-2 text-[13px] ${mono ? "font-mono " : ""}focus:outline-none focus:ring-2 focus:ring-ring`}
        disabled={disabled}
      />
      <p className="text-[12px] text-muted-foreground">{help}</p>
    </div>
  );
}

/** A password input with a reveal toggle and help text. */
export function SecretField({
  id,
  label,
  help,
  value,
  onChange,
  placeholder,
  disabled,
  show,
  onToggleShow,
  showLabel,
  hideLabel,
}: {
  id: string;
  label: string;
  help: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
  show: boolean;
  onToggleShow: () => void;
  showLabel: string;
  hideLabel: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-[13px] font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-md border bg-background px-3 py-2 pr-10 text-[13px] font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          disabled={disabled}
        />
        <button
          type="button"
          onClick={onToggleShow}
          aria-label={show ? hideLabel : showLabel}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      <p className="text-[12px] text-muted-foreground">{help}</p>
    </div>
  );
}
