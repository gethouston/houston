import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ASSISTANT_VIEW_ID } from "../components/assistant/id";
import { isAssistantUnavailableError } from "../lib/assistant-availability";
import {
  assistantLanding,
  driveAssistantLanding,
} from "../lib/assistant-landing";
import { logAndReportError } from "../lib/error-report";
import { queryClient } from "../lib/query-client";
import { queryKeys } from "../lib/query-keys";
import { tauriOrg, tauriWorkspaces } from "../lib/tauri";
import { useAgentStore } from "../stores/agents";
import { useUIStore } from "../stores/ui";
import { useWorkspaceStore } from "../stores/workspaces";
import { channelWorkspaceScope } from "./channel-workspace-scope";
import { discoverAssistant } from "./use-assistant";
import { useSession } from "./use-session";

/** Public channel links resolve a fresh membership before selecting any space. */
export function useAssistantLanding() {
  const { t } = useTranslation("assistant");
  const landing = useRef(assistantLanding(window.location.search)).current;
  const { data: session } = useSession();
  const space = useWorkspaceStore((s) => s.current);
  const handled = useRef(false);
  const generation = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      handled.current = false;
      generation.current++;
    };
  }, []);

  const follow = useCallback(async () => {
    if (!alive.current || landing.kind !== "assistant") return;
    const attempt = ++generation.current;
    let scope = channelWorkspaceScope();
    const current = () =>
      alive.current && generation.current === attempt && scope.current();
    const unavailable = () =>
      useUIStore.getState().addToast({
        title: t("link.unavailableTitle"),
        description: t("link.unavailableDescription"),
        variant: "info",
        action: { label: t("link.retry"), onClick: () => void follow() },
      });
    try {
      const result = await driveAssistantLanding(landing.slug, {
        load: async () => {
          const [memberships, workspaces] = await Promise.all([
            tauriOrg.listOrgs(),
            tauriWorkspaces.list(),
          ]);
          return { memberships: memberships.orgs, workspaces };
        },
        current,
        select: async (workspace, workspaces) => {
          scope.close();
          useWorkspaceStore.setState({ workspaces });
          useWorkspaceStore.getState().setCurrent(workspace);
          scope = channelWorkspaceScope();
          await useAgentStore.getState().loadAgents(workspace.id);
          if (!current()) return false;
          await queryClient.fetchQuery({
            queryKey: queryKeys.assistant(),
            queryFn: discoverAssistant,
          });
          return current();
        },
        open: () => useUIStore.getState().setViewMode(ASSISTANT_VIEW_ID),
      });
      if (result === "unavailable" && current()) unavailable();
    } catch (error) {
      if (!current()) return;
      if (!isAssistantUnavailableError(error))
        logAndReportError("assistant_landing", error);
      unavailable();
    } finally {
      scope.close();
    }
  }, [landing, t]);

  useEffect(() => {
    if (handled.current || !session || !space || landing.kind === "absent")
      return;
    handled.current = true;
    if (landing.kind === "invalid") {
      useUIStore.getState().addToast({
        title: t("link.invalidTitle"),
        description: t("link.invalidDescription"),
        variant: "info",
      });
      return;
    }
    void follow();
  }, [session, space, landing, follow, t]);
}
