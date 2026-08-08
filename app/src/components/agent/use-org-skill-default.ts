import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../hooks/use-capabilities";
import { analytics } from "../../lib/analytics";
import { logger } from "../../lib/logger";
import { isMissingSkillError } from "../../lib/missing-skill";
import {
  isOrgSkillShareDeclined,
  shareNewSkillToWorkspace,
} from "../../lib/org-skill-share";
import { queryKeys } from "../../lib/query-keys";
import {
  tauriSharedSkills,
  tauriSkills,
  tauriSkillsManifest,
} from "../../lib/tauri";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";

/** Cross-instance dedupe: the claim can be observed by more than one mounted
 *  hook (the agent's Skills section + global chat) — the first observer runs
 *  the share,
 *  the rest see the key and skip. */
const inFlight = new Set<string>();

/** Per-agent serialization of THIS module's manifest read-modify-writes: two
 *  skills finishing their create chats concurrently on the same agent must
 *  not race each other's GET → PUT and drop a slug (last-writer-wins). Other
 *  surfaces' manifest writers keep their own existing GET → PUT pattern; this
 *  queue only closes the race the org-share default itself introduces. */
const manifestQueues = new Map<string, Promise<void>>();
function enqueueManifestWrite(
  path: string,
  op: () => Promise<void>,
): Promise<void> {
  const next = (manifestQueues.get(path) ?? Promise.resolve())
    .catch(() => {})
    .then(op);
  manifestQueues.set(path, next);
  return next;
}

/**
 * Org skill by default (HOU-1192): returns the fire-and-forget callback the
 * claim sites invoke with a freshly agent-created skill's slug. On shared-
 * store deployments it moves the skill to the workspace store and installs
 * it to the ONE agent that built it (`lib/org-skill-share.ts` owns the flow
 * + ordering) — the other agents see it in the store, ready for the user to
 * enable. Where the store is absent or declines, the skill stays agent-local
 * exactly as before, so the callback is safe to call unconditionally.
 */
export function useOrgSkillDefault(agent: Agent): (slug: string) => void {
  const { t } = useTranslation("skills");
  const queryClient = useQueryClient();
  const { capabilities } = useCapabilities();
  const workspaceId = useWorkspaceStore((s) => s.current?.id ?? null);
  const addToast = useUIStore((s) => s.addToast);
  // Optimistic while capabilities are still loading (`null`): the claim is a
  // one-shot signal, so deferring would drop it forever on a startup race.
  // The wire's own answer closes the no-store path quietly (the classifier's
  // 404/503 declines); only an explicit `sharedSkills: false` skips.
  const advertised =
    capabilities?.sharedSkills !== false && workspaceId !== null;

  return useCallback(
    (slug: string) => {
      if (!advertised || workspaceId === null) return;
      const key = `${workspaceId}/${slug}`;
      if (inFlight.has(key)) return;
      inFlight.add(key);
      shareNewSkillToWorkspace(
        {
          loadLocalContent: async (path, name) => {
            try {
              return (await tauriSkills.load(path, name)).content;
            } catch (err) {
              if (isMissingSkillError(err)) return null;
              throw err;
            }
          },
          promote: async (ws, name, content) => {
            await tauriSharedSkills.promote(ws, name, content, {
              silence: isOrgSkillShareDeclined,
            });
          },
          enable: (path, name) =>
            enqueueManifestWrite(path, async () => {
              const manifest = await tauriSkillsManifest.get(path);
              const enabled = new Set(manifest.enabled);
              enabled.add(name);
              await tauriSkillsManifest.set(path, {
                version: 1,
                enabled: [...enabled].sort(),
              });
            }),
          // The delete's SkillsChanged refetch drops the local row from the
          // merged strip; the shared row must already be in cache by then, or
          // the ghost-skill deselect closes the open setup chat. Refresh the
          // two caches the merge reads BEFORE the compare + delete (not
          // inside deleteLocal — the compare must sit directly against the
          // delete so a concurrent agent edit has the narrowest window).
          beforeDelete: async () => {
            await Promise.all([
              queryClient.refetchQueries({
                queryKey: queryKeys.sharedSkills(workspaceId),
              }),
              queryClient.refetchQueries({
                queryKey: queryKeys.skillsManifest(agent.folderPath),
              }),
            ]);
          },
          deleteLocal: (path, name) => tauriSkills.delete(path, name),
        },
        { workspaceId, creatorPath: agent.folderPath, slug },
      )
        .then((result) => {
          if (result.outcome !== "shared") {
            logger.info(
              `[org-skill] '${slug}' stayed agent-local (${result.outcome})`,
            );
            return;
          }
          queryClient.invalidateQueries({
            queryKey: queryKeys.sharedSkills(workspaceId),
          });
          queryClient.invalidateQueries({
            queryKey: queryKeys.skillsManifest(agent.folderPath),
          });
          queryClient.invalidateQueries({
            queryKey: queryKeys.skills(agent.folderPath),
          });
          queryClient.invalidateQueries({
            queryKey: ["skill-detail", agent.folderPath],
          });
          analytics.track("skill_installed", {
            skill_slug: slug,
            source: "org-default",
          });
          if (result.creatorEnabled) {
            addToast({ title: t("global.createdShared"), variant: "success" });
          } else {
            // The failed manifest write already toasted its real reason
            // through call(); a success toast beside it would contradict it.
            logger.error(
              `[org-skill] '${slug}' creator manifest enable failed`,
            );
          }
        })
        .catch((err) =>
          // Unexpected failures surfaced (toast + Sentry) through call()
          // inside the deps; the skill stays agent-local and usable.
          logger.error(`[org-skill] share of '${slug}' failed: ${err}`),
        )
        .finally(() => inFlight.delete(key));
    },
    [advertised, workspaceId, agent.folderPath, queryClient, addToast, t],
  );
}
