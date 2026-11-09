import {
  type CitedMessage,
  UserAttachmentBadge,
  type UserAttachmentMessageLabels,
  UserCitationMessage,
} from "@houston-ai/chat";
import { useQueries } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { fileNameOf } from "../../lib/agent-file-paths";
import { logAndReportError } from "../../lib/error-report";
import { isFileGoneError } from "../../lib/file-gone";
import { tauriFiles } from "../../lib/tauri";
import { useUIStore } from "../../stores/ui";
import { UserSkillMessage } from "../user-skill-message";
import { pageName, sentPillGroups } from "./citation-labels";

/** The crops a sent message points at, as object URLs, from the workspace. */
function useCropUrls(
  agentPath: string,
  paths: readonly (string | undefined)[],
) {
  const results = useQueries({
    queries: paths.map((path) => ({
      queryKey: ["citation-crop", agentPath, path],
      enabled: !!path,
      staleTime: Number.POSITIVE_INFINITY,
      gcTime: 5 * 60_000,
      retry: false,
      queryFn: async () =>
        (await tauriFiles.download(agentPath, path ?? "", { toast: false }))
          .blob,
    })),
  });
  // A crop the person deleted from Files just shows no thumbnail; anything
  // else is a fault worth hearing about.
  const failures = results.map((r) => r.error);
  useEffect(() => {
    for (const error of failures)
      if (error && !isFileGoneError(error))
        logAndReportError("citation_crop", error);
    // biome-ignore lint/correctness/useExhaustiveDependencies: one report per error identity
  }, failures);
  const blobs = results.map((r) => r.data);
  const urls = useMemo(
    () => blobs.map((blob) => (blob ? URL.createObjectURL(blob) : undefined)),
    // biome-ignore lint/correctness/useExhaustiveDependencies: one URL per blob identity
    blobs,
  );
  useEffect(
    () => () => {
      for (const url of urls) if (url) URL.revokeObjectURL(url);
    },
    [urls],
  );
  return urls;
}

/**
 * A sent message that carried file comments: the Skill it ran, if any, then
 * pills (grouped by file) above what the person typed, and the attachment
 * badge if files rode along. A pill opens the file at its page in the
 * preview panel.
 */
export function CitedUserMessage({
  cited,
  attachmentLabels,
  agentPath,
  draftKey,
}: {
  cited: CitedMessage;
  attachmentLabels?: UserAttachmentMessageLabels;
  agentPath: string;
  draftKey: string | null;
}) {
  const { t } = useTranslation("agents");
  const setFilePreview = useUIStore((s) => s.setFilePreview);
  const urls = useCropUrls(
    agentPath,
    cited.citations.map((c) => c.cropPath),
  );
  const groups = useMemo(
    () => sentPillGroups(t, cited.citations, urls),
    [cited, urls, t],
  );
  const open = (id: string) => {
    const c = cited.citations[Number(id)];
    if (!c) return;
    setFilePreview({
      agentPath,
      filePath: c.filePath,
      fileName: fileNameOf(c.filePath),
      chat: draftKey ? { draftKey } : null,
      page: c.page,
    });
  };
  const { skill, attachments } = cited;
  return (
    <div className="flex flex-col items-end gap-2">
      {skill && (
        <UserSkillMessage
          invocation={{ ...skill, message: "", attachments: [] }}
        />
      )}
      <UserCitationMessage
        groups={groups}
        onOpen={open}
        noCommentLabel={t("files.preview.comments.noComment")}
        openLabel={(chip) => {
          const c = cited.citations[Number(chip.id)];
          return t("files.preview.comments.pillOpen", {
            where: pageName(t, c?.fileName ?? "", c?.page ?? 1),
            comment: chip.comment || t("files.preview.comments.noComment"),
          });
        }}
      >
        {cited.text && (
          <span className="whitespace-pre-wrap break-words">{cited.text}</span>
        )}
      </UserCitationMessage>
      {attachments.length > 0 && (
        <UserAttachmentBadge files={attachments} labels={attachmentLabels} />
      )}
    </div>
  );
}
