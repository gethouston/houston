import { Button } from "@houston-ai/core";
import { Check, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  useIntegrationConnections,
  useIntegrationToolkits,
} from "../../../../hooks/queries/use-integrations";
import { EMAIL_TOOLKITS } from "../../../../lib/academy/email-lesson/email-sender";
import { appDisplay } from "../../../integrations/app-display";
import { AppRow } from "../../../integrations/app-row";
import { INTEGRATION_PROVIDER } from "../../../integrations/model";
import { useConnectFlow } from "../../../integrations/use-connect-flow";

/**
 * Gmail and Outlook, each on the Integrations screen's own row and through its
 * own connect flow, so what the user does here is exactly what they would do
 * there.
 */
export function EmailConnectList() {
  const { t } = useTranslation("academy");
  const catalog = useIntegrationToolkits(INTEGRATION_PROVIDER, true);
  const connections = useIntegrationConnections(INTEGRATION_PROVIDER, true);
  const flow = useConnectFlow({});
  const bySlug = new Map((catalog.data ?? []).map((tk) => [tk.slug, tk]));
  const active = new Set(
    (connections.data ?? [])
      .filter((c) => c.status === "active")
      .map((c) => c.toolkit),
  );

  return (
    <ul className="flex flex-col gap-2">
      {EMAIL_TOOLKITS.map(({ toolkit }) => (
        <li key={toolkit}>
          <AppRow
            display={appDisplay(toolkit, bySlug.get(toolkit))}
            trailing={
              active.has(toolkit) ? (
                <span className="inline-flex items-center gap-1.5 pr-1 text-xs font-medium text-success">
                  <Check className="size-4" strokeWidth={2.5} />
                  {t("lessons.employee-email.steps.connect.connected")}
                </span>
              ) : toolkit in flow.states ? (
                <span className="inline-flex items-center gap-2 pr-1 text-xs text-ink-muted">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {t("lessons.employee-email.steps.connect.connecting")}
                  <button
                    type="button"
                    onClick={() => flow.cancel(toolkit)}
                    className="font-medium text-ink underline-offset-2 transition-colors hover:underline"
                  >
                    {t("lessons.employee-email.steps.connect.cancel")}
                  </button>
                </span>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  className="rounded-full active:scale-[0.96]"
                  onClick={() =>
                    void flow.connect(toolkit, `academyEmail:${toolkit}`)
                  }
                >
                  {t("lessons.employee-email.steps.connect.connect")}
                </Button>
              )
            }
          />
        </li>
      ))}
    </ul>
  );
}
