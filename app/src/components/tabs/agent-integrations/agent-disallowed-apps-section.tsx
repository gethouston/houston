import { useTranslation } from "react-i18next";
import { AppRow, accountDisplayLabel } from "../../integrations";
import type { AgentAppRow as AgentAppRowVM } from "./model";

interface AgentDisallowedAppsSectionProps {
  /** Connected accounts the agent's Teams allowlist ceiling forbids. */
  rows: AgentAppRowVM[];
}

/**
 * Connected apps a manager has excluded from this agent's allowlist. Shown so
 * the state is transparent (the app is connected on the account but this agent
 * may not use it) rather than silently vanishing. Read-only: no connect or
 * activate affordance, a plain "Not allowed" badge and an explanation. Rendered
 * by the tab only when there is at least one such app.
 */
export function AgentDisallowedAppsSection({
  rows,
}: AgentDisallowedAppsSectionProps) {
  const { t } = useTranslation(["teams", "integrations"]);

  return (
    <section className="mt-8">
      <h2 className="text-sm font-medium text-foreground">
        {t("integrations.notAllowed.title")}
      </h2>
      <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
        {t("integrations.notAllowed.body")}
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map(({ connection, app, showAccountLabel }) => (
          <AppRow
            key={connection.connectionId}
            display={app}
            description={
              showAccountLabel
                ? accountDisplayLabel(
                    connection,
                    t("integrations:account.unnamed"),
                  )
                : app.description
            }
            trailing={
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {t("integrations.notAllowed.badge")}
              </span>
            }
          />
        ))}
      </div>
    </section>
  );
}
