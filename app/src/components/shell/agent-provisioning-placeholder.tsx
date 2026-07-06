/**
 * Centered placeholder shown INSTEAD of a tab's content while a just-created
 * agent's engine is still warming up (HOU-693) — it takes the exact spot
 * where the tab would otherwise sit on its own "Loading..." spinner forever.
 * The activity tab is excluded: there the in-chat `AgentProvisioningCard`
 * carries the same message at send time. Not rendering the tab at all also
 * keeps its queries from piling onto the cold engine; they mount fresh the
 * moment the readiness probe clears the mark.
 */

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Spinner,
} from "@houston-ai/core";
import { useTranslation } from "react-i18next";

export function AgentProvisioningPlaceholder() {
  const { t } = useTranslation("shell");
  return (
    <div className="flex h-full items-center justify-center" role="status">
      <Empty>
        <EmptyHeader>
          <Spinner className="mx-auto size-5 text-muted-foreground" />
          <EmptyTitle>{t("agentProvisioning.title")}</EmptyTitle>
          <EmptyDescription>{t("agentProvisioning.body")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
