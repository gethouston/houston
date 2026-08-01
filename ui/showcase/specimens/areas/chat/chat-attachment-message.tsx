import {
  type AttachmentInvocation,
  UserAttachmentBadge,
  UserAttachmentMessage,
} from "@houston-ai/chat";

import {
  type Specimen,
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";

/** One file, sent with a line of text. */
const ONE_FILE: AttachmentInvocation = {
  message: "Here is the December invoice, tell me if it was already paid.",
  files: [
    {
      name: "december-invoice.pdf",
      path: "/Users/julian/.houston/Inbox Zero/attachments/december-invoice.pdf",
    },
  ],
};

/** Several files and no words — a drag-and-drop with nothing typed. */
const FILES_ONLY: AttachmentInvocation = {
  message: "",
  files: [
    { name: "receipts.csv", path: "/tmp/receipts.csv" },
    { name: "vendors.csv", path: "/tmp/vendors.csv" },
    { name: "notes.md", path: "/tmp/notes.md" },
  ],
};

function ChatAttachmentMessageSpecimen() {
  return (
    <SpecimenPage
      title="UserAttachmentMessage"
      intro="A turn that carried files: what the person said, and a count of what came with it — never the raw paths the model was actually handed."
    >
      <SpecimenSection
        title="Variants"
        note="The message is optional; the badge is not. A drop with nothing typed renders the badge alone, so the turn still reads as something the user did."
      >
        <SpecimenRow label="Text + one file">
          <div className="flex w-full max-w-md justify-end">
            <UserAttachmentMessage invocation={ONE_FILE} />
          </div>
        </SpecimenRow>
        <SpecimenRow label="Files only">
          <div className="flex w-full max-w-md justify-end">
            <UserAttachmentMessage invocation={FILES_ONLY} />
          </div>
        </SpecimenRow>
        <SpecimenRow label="UserAttachmentBadge alone">
          <UserAttachmentBadge files={ONE_FILE.files} />
          <UserAttachmentBadge files={FILES_ONLY.files} />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="`labels.attachmentCount` is the whole i18n surface: the library falls back to an English singular/plural pair so `ui/chat` stands alone, and the app passes its own `t()` counter in. No file list is ever rendered inline; hovering the badge reveals the names in its title."
      >
        <SpecimenRow label="Localized count">
          <UserAttachmentBadge
            files={FILES_ONLY.files}
            labels={{ attachmentCount: (count) => `${count} archivos` }}
          />
        </SpecimenRow>
        <SpecimenRow label="Singular fallback">
          <UserAttachmentBadge files={ONE_FILE.files} />
        </SpecimenRow>
        <SpecimenRow label="No files (renders nothing)">
          <UserAttachmentBadge files={[]} />
          <span className="text-ink-muted text-xs">
            An empty list renders nothing, so an attachment-less turn never
            shows an empty badge.
          </span>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps
        items={[
          {
            name: "invocation",
            type: "AttachmentInvocation",
            note: "UserAttachmentMessage. `{ message, files }`, decoded from the persisted marker by `decodeAttachmentMessage`. Paths are decodeable but deliberately never rendered.",
          },
          {
            name: "files",
            type: "readonly AttachmentReference[]",
            note: "UserAttachmentBadge. `{ name, path }` per file. An empty array renders nothing.",
          },
          {
            name: "labels",
            type: "UserAttachmentMessageLabels",
            note: "Both. `attachmentCount(count)` returns the already-translated count line. Omit for the English singular/plural fallback.",
          },
        ]}
      />

      <SpecimenTokens
        classes={[
          "bg-chip",
          "bg-input",
          "border-line",
          "text-ink",
          "text-ink-muted",
        ]}
      />
    </SpecimenPage>
  );
}

/** The `@houston-ai/*` symbols this page documents. */
export const sources: string[] = [
  "UserAttachmentMessage",
  "UserAttachmentBadge",
];

export const specimen: Specimen = {
  id: "chat-attachment-message",
  title: "UserAttachmentMessage",
  group: "Chat",
  render: () => <ChatAttachmentMessageSpecimen />,
};
