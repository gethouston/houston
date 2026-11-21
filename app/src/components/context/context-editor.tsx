import { cn } from "@houston-ai/core";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ContextEditorLayout } from "./context-editor-model";
import { MarkdownEditor } from "./markdown-editor";
import { useContextEditorSave } from "./use-context-editor-save";

export type { ContextEditorLayout } from "./context-editor-model";

export function ContextEditorBox({
  content,
  onSave,
  placeholder,
  layout,
  readOnly = false,
  ariaLabel,
  dataTestId,
}: {
  content: string;
  onSave: (content: string) => Promise<unknown>;
  placeholder: string;
  layout: ContextEditorLayout;
  readOnly?: boolean;
  ariaLabel?: string;
  dataTestId?: string;
}) {
  const { t } = useTranslation("context");
  const save = useContextEditorSave({ content, onSave, readOnly });

  const status = (
    <span
      className={cn(
        "flex items-center gap-1 text-xs tabular-nums transition-opacity duration-200",
        save.state === "idle" ? "opacity-0" : "opacity-100 text-ink-muted",
      )}
      aria-live="polite"
    >
      {save.state === "saved" && <Check aria-hidden className="size-4" />}
      {save.state === "saving"
        ? t("editor.saving")
        : save.state === "saved"
          ? t("editor.saved")
          : ""}
    </span>
  );

  return (
    <div className={cn("w-full", layout === "fill" && "h-full min-h-0")}>
      <MarkdownEditor
        ariaLabel={ariaLabel}
        dataTestId={dataTestId}
        content={save.value}
        plain={save.plainDoc}
        layout={layout}
        onChange={save.handleChange}
        onBlur={save.handleBlur}
        onFocusChange={save.handleFocusChange}
        readOnly={readOnly}
        placeholder={placeholder}
        statusSlot={status}
      />
    </div>
  );
}
