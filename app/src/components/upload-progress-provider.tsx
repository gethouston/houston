import {
  type AttachmentProgressLabels,
  AttachmentProgressProvider,
} from "@houston-ai/chat";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { attachmentUploadDisplay } from "../lib/upload-progress";

export function useUploadProgressLabels(): AttachmentProgressLabels {
  const { t } = useTranslation("chat");
  return {
    uploading: t("composer.uploadProgress.uploading"),
    reconnecting: t("composer.uploadProgress.reconnecting"),
    saving: t("composer.uploadProgress.saving"),
    done: t("composer.uploadProgress.done"),
  };
}

export function UploadProgressProvider({ children }: { children: ReactNode }) {
  const progress = useStore(attachmentUploadDisplay);
  const labels = useUploadProgressLabels();
  return (
    <AttachmentProgressProvider value={{ progress, labels }}>
      {children}
    </AttachmentProgressProvider>
  );
}
