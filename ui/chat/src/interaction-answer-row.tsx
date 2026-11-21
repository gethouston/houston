"use client";

import { Button, cn, Kbd } from "@houston-ai/core";
import { ChatInputAttachButton } from "./chat-input-attach-button";
import { ChatInputAttachments } from "./chat-input-attachments";
import { FreeTextRow } from "./interaction-free-text-row";
import type { CardAttach } from "./use-card-attachments";

export function QuestionAnswerRow({
  disabled,
  draft,
  placeholder,
  sendLabel,
  hideFreeText = false,
  attach,
  fileAnswer,
  uploadArea = false,
  skip,
  onDraftChange,
  onSubmit,
}: {
  disabled: boolean;
  draft: string;
  placeholder: string;
  sendLabel: string;
  hideFreeText?: boolean;
  attach?: CardAttach | null;
  fileAnswer: boolean;
  uploadArea?: boolean;
  skip: {
    label: string;
    escLabel: string;
    onSkip: () => void;
    disabled: boolean;
  };
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const plus = attach && !uploadArea ? attach : null;
  return (
    <>
      {attach && !uploadArea && (
        <div className={cn(attach.files.length > 0 && "mt-3")}>
          <ChatInputAttachments
            files={attach.files}
            fileInputRef={attach.fileInputRef}
            folderCountLabel={attach.labels?.folderFileCount}
            folderInputRef={attach.folderInputRef}
            onFileChange={attach.handleFileChange}
            onRemoveFiles={attach.removeFiles}
            removeLabel={attach.labels?.removeAttachment}
          />
        </div>
      )}
      <div
        className={cn(
          "flex gap-2",
          hideFreeText
            ? cn("items-center", plus ? "justify-between" : "justify-end")
            : "items-end",
        )}
      >
        {!hideFreeText && (
          <div className="min-w-0 flex-1">
            <FreeTextRow
              attach={attach}
              attachButton={plus !== null}
              disabled={disabled}
              fileAnswer={fileAnswer}
              onChange={onDraftChange}
              onSubmit={onSubmit}
              placeholder={placeholder}
              sendLabel={sendLabel}
              value={draft}
            />
          </div>
        )}
        {hideFreeText && plus && (
          <div className="mt-1.5">
            <ChatInputAttachButton
              ariaLabel={plus.labels?.attachFiles}
              disabled={disabled}
              onOpenFilePicker={plus.openFilePicker}
              onOpenFolderPicker={plus.openFolderPicker}
            />
          </div>
        )}
        <Button
          className={cn(
            "mt-1.5 gap-1.5 text-ink-muted",
            !hideFreeText && "mb-1.5",
          )}
          disabled={skip.disabled}
          onClick={skip.onSkip}
          size="sm"
          type="button"
          variant="outline"
        >
          {skip.label}
          <Kbd className="hidden md:inline-flex">{skip.escLabel}</Kbd>
        </Button>
      </div>
    </>
  );
}
