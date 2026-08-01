import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

/**
 * The API-key entry field: a labelled password input with a reveal toggle.
 *
 * Its own component so {@link ProviderApiKeyDialog} stays the flow (submit and
 * verification verdicts) rather than also owning input chrome. Paste is never blocked and the reveal state resets with the
 * field's own mount, so a revealed key can't survive a reopen.
 */
export function ProviderApiKeyField({
  label,
  placeholder,
  showLabel,
  hideLabel,
  value,
  disabled,
  onChange,
}: {
  label: string;
  placeholder: string;
  /** Accessible name for the reveal toggle while the key is hidden. */
  showLabel: string;
  /** Accessible name for the reveal toggle while the key is visible. */
  hideLabel: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="space-y-1.5">
      <label htmlFor="provider-api-key" className="text-[13px] font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id="provider-api-key"
          type={show ? "text" : "password"}
          autoComplete="off"
          // biome-ignore lint/a11y/noAutofocus: only ever rendered inside the api-key dialog, which exists to receive this one value; the inline field it replaced autofocused too (the rule tolerated it there because the <input> sat lexically inside <Dialog>).
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-md border bg-input px-3 py-2 pr-10 text-[13px] font-mono focus:outline-none focus:ring-2 focus:ring-focus"
          disabled={disabled}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? hideLabel : showLabel}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded"
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}
