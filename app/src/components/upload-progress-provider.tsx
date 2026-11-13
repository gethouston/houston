import { AttachmentProgressProvider } from "@houston-ai/chat";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { attachmentUploadDisplay } from "../lib/upload-progress";

export function UploadProgressProvider({ children }: { children: ReactNode }) {
  const progress = useStore(attachmentUploadDisplay);
  const { t } = useTranslation("chat");
  return (
    <AttachmentProgressProvider
      value={{
        progress,
        labels: {
          uploading: t("composer.uploadProgress.uploading"),
          reconnecting: t("composer.uploadProgress.reconnecting"),
          saving: t("composer.uploadProgress.saving"),
        },
      }}
    >
      {children}
    </AttachmentProgressProvider>
  );
}
