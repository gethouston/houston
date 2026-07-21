import { useId } from "react";
import { useTranslation } from "react-i18next";
import { useHandleAvailability } from "../../../hooks/use-handle-availability";

/** The inline-hint tone under the field. */
type HintTone = "muted" | "success" | "error";

/**
 * The `@handle` claim/edit input: a lowercase, `@`-prefixed field wired to live
 * availability ({@link useHandleAvailability}) so the user sees `available` /
 * `taken` / `reserved` / `invalid` / `checking` as they type, before ever
 * pressing Save. `serverError` (a localized message the parent sets from a
 * failed save, e.g. `handle_change_too_soon` or a `taken` race) takes
 * precedence over the live hint until the next keystroke clears it.
 */
export function HandleField({
  value,
  onChange,
  serverError,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  serverError?: string | null;
  disabled?: boolean;
}) {
  const { t } = useTranslation("store");
  const id = useId();
  const status = useHandleAvailability(value);
  const hint = resolveHint(status, serverError, t);
  const invalid = hint?.tone === "error";

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {t("profile.handleLabel")}
      </label>
      <div
        className={`flex items-center rounded-md border bg-input px-3 focus-within:ring-2 focus-within:ring-focus ${
          invalid ? "border-danger" : "border-line"
        }`}
      >
        <span className="text-sm text-ink-muted" aria-hidden="true">
          @
        </span>
        <input
          id={id}
          type="text"
          value={value}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={invalid}
          placeholder={t("profile.handlePlaceholder")}
          onChange={(e) =>
            onChange(e.target.value.replace(/^@+/, "").toLowerCase())
          }
          disabled={disabled}
          className="flex-1 bg-transparent py-2 pl-1 text-sm text-ink outline-none placeholder:text-ink-muted disabled:opacity-60"
        />
      </div>
      <p className={`text-xs ${toneClass(hint?.tone ?? "muted")}`}>
        {hint?.text ?? t("profile.handleHint")}
      </p>
    </div>
  );
}

function toneClass(tone: HintTone): string {
  if (tone === "success") return "text-success";
  if (tone === "error") return "text-danger";
  return "text-ink-muted";
}

/**
 * Pick the hint line: a save-time server error wins, then the live
 * availability state, else the neutral grammar hint.
 */
function resolveHint(
  status: ReturnType<typeof useHandleAvailability>,
  serverError: string | null | undefined,
  t: (key: string) => string,
): { text: string; tone: HintTone } | null {
  if (serverError) return { text: serverError, tone: "error" };
  if (status.state === "checking")
    return { text: t("profile.handleChecking"), tone: "muted" };
  if (status.state !== "result") return null;
  const { available, reason } = status.availability;
  if (available) return { text: t("profile.handleAvailable"), tone: "success" };
  if (reason === "reserved")
    return { text: t("profile.handleReserved"), tone: "error" };
  if (reason === "invalid")
    return { text: t("profile.handleInvalid"), tone: "error" };
  return { text: t("profile.handleTaken"), tone: "error" };
}
