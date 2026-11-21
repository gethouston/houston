import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  decodeMarkdownHref,
  fileNameOf,
  toWorkspaceRelative,
} from "../lib/agent-file-paths";
import { isCoLocatedEngine, newEngineActive } from "../lib/engine";
import { genericErrorDescription } from "../lib/error-report";
import { looksLikeUrl } from "../lib/open-href";
import { tauriFiles, tauriSystem } from "../lib/tauri";
import { useAgentStore } from "../stores/agents";
import { useUIStore } from "../stores/ui";
import { useCapabilities } from "./use-capabilities";

export function useOpenAgentFile(
  agentPath: string | null,
  draftKey?: string | null,
): {
  openFile: (rawPath: string) => void;
  opensLocally: boolean;
} {
  const { t } = useTranslation("agents");
  const { capabilities } = useCapabilities();
  const addToast = useUIStore((s) => s.addToast);
  const setFilePreview = useUIStore((s) => s.setFilePreview);
  const agent = useAgentStore((s) =>
    s.agents.find((a) => a.folderPath === agentPath),
  );

  const osDir =
    agent?.localDir ??
    (newEngineActive() ? undefined : (agentPath ?? undefined));
  const opensLocally =
    isTauri() &&
    isCoLocatedEngine() &&
    (capabilities?.revealInOs ?? true) &&
    osDir !== undefined;

  const openFile = useCallback(
    (rawPath: string) => {
      if (!agentPath) return;
      if (opensLocally && osDir !== undefined) {
        tauriFiles.open(osDir, rawPath).catch((err) => {
          addToast({
            variant: "error",
            title: t("files.toasts.openFailedTitle"),
            description: genericErrorDescription("open_chat_file", err),
          });
        });
        return;
      }
      const filePath = toWorkspaceRelative(rawPath, {
        folderPath: agentPath,
        localDir: agent?.localDir,
      });
      setFilePreview({
        agentPath,
        filePath,
        fileName: fileNameOf(filePath),
        chat: draftKey ? { draftKey } : null,
      });
    },
    [
      agentPath,
      draftKey,
      agent?.localDir,
      opensLocally,
      osDir,
      addToast,
      setFilePreview,
      t,
    ],
  );

  return useMemo(() => ({ openFile, opensLocally }), [openFile, opensLocally]);
}

export function useOpenAgentHref(
  agentPath: string | null,
  draftKey?: string | null,
): (href: string) => void {
  const { openFile } = useOpenAgentFile(agentPath, draftKey);
  return useCallback(
    (href: string) => {
      const trimmed = href.trim();
      if (!trimmed) return;
      if (looksLikeUrl(trimmed)) {
        void tauriSystem.openUrl(trimmed, { command: "open_href" });
        return;
      }
      openFile(decodeMarkdownHref(trimmed));
    },
    [openFile],
  );
}
