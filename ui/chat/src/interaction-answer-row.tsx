"use client";

import { Button, cn, Kbd } from "@houston-ai/core";
import { ChatInputAttachButton } from "./chat-input-attach-button";
import { ChatInputAttachments } from "./chat-input-attachments";
import { FreeTextRow } from "./interaction-free-text-row";
import type { CardAttach } from "./use-card-attachments";

/** The question's fixed answer row — the free-text escape field with the
 *  card-wide decline at its right ("type here, or skip" in one glance) —
 *  handed to the modal's `trailing` slot so it never scrolls away with a long
 *  option list. `hideFreeText` drops the field and leaves the skip button
 *  right-aligned alone (beside a bare "+" when the card takes attachments).
 *
 *  With `attach`, the panel's attached files show as the composer's chips
 *  above the row: the card replaced the composer, so this is the one place
 *  they are visible, and they leave with whichever answer completes the card
 *  (a typed one or a picked option). `uploadArea` says the step's upload
 *  area shows this step's files and opens the picker, so the row drops its
 *  chips and its "+" and keeps only the field (which still takes a pasted
 *  file). */
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
          // A growing field keeps the skip at its bottom, beside its send.
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
          // mb-1.5 lines the skip up with the field's send button (both 32px,
          // 6px off the pill's bottom), which also centres it on one line.
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
          {/* Esc means nothing on a touch screen, and the phone row needs the
              width for the field. */}
          <Kbd className="hidden md:inline-flex">{skip.escLabel}</Kbd>
        </Button>
      </div>
    </>
  );
}
