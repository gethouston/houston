/**
 * InstructionsPanel — editable instruction files for an agent workspace.
 * Visual style matches Houston's ContextTab exactly: labeled textareas
 * with auto-save on blur, bg-[#f9f9f9], subtle borders.
 */
import { useEffect, useState } from "react";
import type { InstructionFile } from "./types";

export interface InstructionsPanelProps {
  /** Instruction files to display */
  files: InstructionFile[];
  /** Called when a file is edited and the textarea loses focus */
  onSave: (name: string, content: string) => Promise<void>;
  /** Title for empty state */
  emptyTitle?: string;
  /** Description for empty state */
  emptyDescription?: string;
}

export function InstructionsPanel({
  files,
  onSave,
  emptyTitle = "No instructions yet",
  emptyDescription = "Add a CLAUDE.md to this workspace to configure how the agent behaves.",
}: InstructionsPanelProps) {
  if (files.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center pt-[20vh] gap-4 px-8">
        <div className="space-y-2 text-center max-w-md">
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            {emptyTitle}
          </h1>
          <p className="text-sm text-muted-foreground">{emptyDescription}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-6 py-6">
        <div className="space-y-4">
          {files.map((file) => (
            <InstructionField
              key={file.name}
              file={file}
              onSave={(content) => onSave(file.name, content)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function InstructionField({
  file,
  onSave,
}: {
  file: InstructionFile;
  onSave: (content: string) => Promise<void>;
}) {
  const [value, setValue] = useState(file.content);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(file.content);
  }, [file.content]);

  const handleBlur = async () => {
    if (value !== file.content) {
      setSaving(true);
      await onSave(value);
      setSaving(false);
    }
  };

  const fieldId = `instruction-${file.name}`;

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={fieldId}
        className="text-xs font-medium text-muted-foreground/50 px-1 flex items-center gap-2"
      >
        {file.label}
        {saving && (
          <span className="text-[10px] text-muted-foreground/30">
            Saving...
          </span>
        )}
      </label>
      <textarea
        id={fieldId}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
        placeholder="Write instructions for your agent here..."
        rows={Math.max(4, value.split("\n").length + 1)}
        className="w-full text-sm text-foreground leading-relaxed bg-[#f9f9f9] outline-none rounded-xl px-4 py-3 border border-black/[0.04] hover:border-black/[0.1] focus:border-black/[0.15] focus:bg-white transition-all duration-200 resize-none placeholder:text-muted-foreground/30"
      />
    </div>
  );
}
