import { useTranslation } from "react-i18next";
import {
  AppRow,
  EnableInPermissionsButton,
  type PermissionsFix,
} from "../../integrations";
import type { AgentAppRow as AgentAppRowVM } from "./model";

interface AgentDisallowedAppsSectionProps {
  /** Connected apps the agent's Teams allowlist ceiling forbids. */
  rows: AgentAppRowVM[];
  /**
   * Resolve the "Enable it in Permissions" deep-link for a forbidden app, or
   * `undefined` when the viewer can't lift that app's ceiling. When set (owner or
   * this agent's manager), each fixable row's "Not allowed" badge is replaced by
   * the CTA and the subtitle points to Permissions; the member view (no resolver,
   * or a row the viewer can't fix) keeps the ask-your-admin copy and the badge.
   */
  onEnable?: PermissionsFix;
}

/**
 * Connected apps a manager has excluded from this agent's allowlist. Shown so
 * the state is transparent (the app is connected on the account but this agent
 * may not use it) rather than silently vanishing. Read-only for a member: a
 * plain "Not allowed" badge and an ask-your-admin explanation. A viewer who can
 * lift the blocking ceiling gets a role-aware CTA instead, deep-linking into the
 * Admin Permissions area (the org Allowed apps section for an org-ceiling block,
 * this agent's drill-in for an agent-ceiling block). Rendered by the tab only
 * when there is at least one such app.
 */
export function AgentDisallowedAppsSection({
  rows,
  onEnable,
}: AgentDisallowedAppsSectionProps) {
  const { t } = useTranslation("teams");

  // Resolve each row's fix once: it drives both the per-row affordance and the
  // subtitle (only promise "Enable them in Permissions" when at least one row
  // here is actually fixable by this viewer).
  const fixes = rows.map(({ connection }) => onEnable?.(connection.toolkit));
  const anyFix = fixes.some(Boolean);

  return (
    <section>
      <h2 className="text-sm font-medium text-ink">
        {t("integrations.notAllowed.title")}
      </h2>
      <p className="mb-3 mt-0.5 text-xs text-ink-muted">
        {t(
          anyFix
            ? "integrations.notAllowed.bodyManager"
            : "integrations.notAllowed.body",
        )}
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map(({ connection, app }, i) => {
          const fix = fixes[i];
          return (
            <AppRow
              key={connection.connectionId || connection.toolkit}
              display={app}
              description={app.description}
              trailing={
                fix ? (
                  <EnableInPermissionsButton
                    label={t("integrations.notAllowed.enableInPermissions")}
                    onClick={fix}
                  />
                ) : (
                  <span className="rounded-full bg-chip px-2 py-0.5 text-[11px] font-medium text-ink-muted">
                    {t("integrations.notAllowed.badge")}
                  </span>
                )
              }
            />
          );
        })}
      </div>
    </section>
  );
}
