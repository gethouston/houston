import { Spinner, Switch } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useOrg, useSetAgentAssignments } from "../../hooks/queries";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useSession } from "../../hooks/use-session";
import { canManageAssignments, isMultiplayer } from "../../lib/org-roles";
import type { Agent } from "../../lib/types";

/**
 * The "Who can use this agent" block on an agent's General settings. Lists org
 * members with a per-member toggle backed by `agent.assignedUserIds` (empty =
 * everyone). Owner sees it for any agent; admin only for agents they're
 * assigned to; plain `user` never (the whole block returns null). The gateway
 * enforces the same authority — these toggles only drive the call.
 */
export function AgentAccessSection({ agent }: { agent: Agent }) {
  const { t } = useTranslation("org");
  const { capabilities } = useCapabilities();
  const { data: session } = useSession();
  const org = useOrg(isMultiplayer(capabilities));
  const setAssignments = useSetAgentAssignments();

  if (!canManageAssignments(capabilities, agent)) return null;

  const selfId = session?.user?.id ?? null;
  const members = org.data?.members ?? [];
  // Empty `assignedUserIds` means "everyone in the org" (the host convention).
  const assigned = new Set(agent.assignedUserIds ?? []);
  const everyone = assigned.size === 0;

  const toggle = (userId: string, on: boolean) => {
    const next = new Set(everyone ? members.map((m) => m.userId) : assigned);
    if (on) next.add(userId);
    else next.delete(userId);
    setAssignments.mutate({
      agentSlugOrId: agent.id,
      userIds: [...next],
    });
  };

  return (
    <section>
      <h2 className="text-lg font-semibold mb-1">{t("assignments.title")}</h2>
      <p className="text-sm text-muted-foreground mb-4">
        {t("assignments.description")}
      </p>

      {org.isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner className="h-5 w-5" />
        </div>
      ) : members.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("assignments.empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {members.map((member) => {
            const isSelf = member.userId === selfId;
            const on = everyone || assigned.has(member.userId);
            return (
              <li
                key={member.userId}
                className="flex items-center gap-3 rounded-xl border border-black/5 bg-card px-4 py-3"
              >
                <div className="flex-1 min-w-0 text-sm truncate">
                  {member.email ?? member.userId}
                  {isSelf && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {t("assignments.you")}
                    </span>
                  )}
                </div>
                <Switch
                  checked={on}
                  onCheckedChange={(checked) => toggle(member.userId, checked)}
                  aria-label={member.email ?? member.userId}
                />
              </li>
            );
          })}
        </ul>
      )}

      {everyone && (
        <p className="mt-3 text-xs text-muted-foreground">
          {t("assignments.everyone")}
        </p>
      )}
    </section>
  );
}
