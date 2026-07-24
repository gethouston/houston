import { ArrowUp } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * The always-visible free-text row under the approval question: the user can
 * confirm from the footer, OR type what to do differently here and send. A
 * MINIATURE of the real composer (rounded pill, hairline border, a circular
 * arrow-up send that turns on the moment there is text), so nothing about it
 * needs learning. Never hover-gated — present at rest on every live approval.
 *
 * Owns its own draft; `onSubmit` fires with the trimmed text (never empty), and
 * the card turns that into the "differently" decision. Enter or the arrow sends.
 */
export function ChatApprovalRedirectRow({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (text: string) => void;
}) {
  const { t } = useTranslation("chat");
  const [value, setValue] = useState("");
  const submit = () => {
    const text = value.trim();
    if (text.length > 0) onSubmit(text);
  };
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: focus-delegation surface — the real widget is the <input> inside; clicking the field's padding focuses it (mirrors the composer). role="presentation" is correct, no widget role applies.
    <div
      className="mt-3 flex cursor-text items-center gap-2 rounded-full border border-line-input bg-transparent py-1 pr-1 pl-3.5 transition-colors focus-within:border-focus dark:bg-line-input/30"
      onClick={(e) => e.currentTarget.querySelector("input")?.focus()}
      role="presentation"
    >
      <input
        className="min-w-0 flex-1 border-none bg-transparent py-1 text-ink text-sm leading-snug outline-none placeholder:text-ink-muted"
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={t("interaction.differentlyPlaceholder")}
        value={value}
      />
      <button
        aria-label={t("interaction.differentlyPlaceholder")}
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-action text-action-text transition-colors hover:bg-action/90 disabled:opacity-30"
        disabled={disabled || value.trim().length === 0}
        onClick={(e) => {
          e.stopPropagation();
          submit();
        }}
        type="button"
      >
        <ArrowUp className="size-4" />
      </button>
    </div>
  );
}
