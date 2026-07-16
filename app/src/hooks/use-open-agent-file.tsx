import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { fileNameOf, toWorkspaceRelative } from "../lib/agent-file-paths";
import { isCoLocatedEngine, newEngineActive } from "../lib/engine";
import { genericErrorDescription } from "../lib/error-toast";
import { logger } from "../lib/logger";
import { looksLikeUrl } from "../lib/open-href";
import { tauriFiles, tauriSystem } from "../lib/tauri";
import { useAgentStore } from "../stores/agents";
import { useUIStore } from "../stores/ui";
import { useCapabilities } from "./use-capabilities";

/**
 * Open a workspace file the agent mentioned in chat (file cards, turn
 * summaries, prose file pills). Same gating as the Files tab (HOU-677):
 *
 *   - Co-located desktop engine → hand the file to the OS's default app,
 *     rooted at the host-reported REAL directory (on the TS engine
 *     `folderPath` is a route key, never a path).
 *   - Everything else (web build, cloud pods, remote hosts) → the in-app
 *     preview dialog, whose footer offers Download (native save dialog on
 *     desktop, browser download on web). Before this hook, these clicks
 *     dead-ended: the web shim rejects `open_file` outright.
 *
 * Accepts every path shape the engine emits (absolute native, workspace-
 * relative, bare) — see lib/agent-file-paths.ts.
 */
export function useOpenAgentFile(agentPath: string | null): {
  openFile: (rawPath: string) => void;
  /** True when clicks hand off to the OS (used to pick the card affordance icon). */
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
      setFilePreview({ agentPath, filePath, fileName: fileNameOf(filePath) });
    },
    [
      agentPath,
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

/**
 * Open a link the agent emitted in chat prose. Two shapes land here:
 *
 *   1. Absolute URLs (`https://…`, `mailto:…`, `houston://…`) → the system
 *      browser.
 *   2. Relative or bare file paths (`perfil.md`, `./report.pdf`) — the
 *      agent's prompt structure encourages dropping these right after
 *      writing a file → `useOpenAgentFile` (OS open or in-app preview).
 */
export function useOpenAgentHref(
  agentPath: string | null,
): (href: string) => void {
  const { openFile } = useOpenAgentFile(agentPath);
  return useCallback(
    (href: string) => {
      const trimmed = href.trim();
      if (!trimmed) return;
      if (looksLikeUrl(trimmed)) {
        tauriSystem.openUrl(trimmed).catch((e) => {
          logger.warn(`[open-href] openUrl(${trimmed}) failed: ${e}`);
        });
        return;
      }
      openFile(trimmed);
    },
    [openFile],
  );
}
