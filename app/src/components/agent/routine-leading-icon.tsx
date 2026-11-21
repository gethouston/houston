import type { Routine } from "@houston/engine-adapter";
import { Webhook } from "lucide-react";
import { type ReactNode, useCallback, useMemo } from "react";
import { useIntegrationToolkits } from "../../hooks/queries/use-integrations";
import { appDisplay } from "../integrations/app-display";
import { AppLogo } from "../integrations/app-logo";
import { INTEGRATION_PROVIDER } from "../integrations/model";
import { routineLeadingIcon } from "./routine-leading-icon-model";

export function useRoutineLeadingIcon(
  triggersEnabled: boolean,
): (routine: Routine) => ReactNode {
  const toolkits = useIntegrationToolkits(
    INTEGRATION_PROVIDER,
    triggersEnabled,
  );
  const toolkitsBySlug = useMemo(
    () => new Map((toolkits.data ?? []).map((tk) => [tk.slug, tk])),
    [toolkits.data],
  );

  return useCallback(
    (routine: Routine) => {
      const icon = routineLeadingIcon(routine);
      if (icon.kind === "schedule") return null;
      if (icon.kind === "webhook") {
        return <Webhook className="size-4 text-ink-muted" strokeWidth={1.75} />;
      }
      return (
        <AppLogo
          display={appDisplay(icon.toolkit, toolkitsBySlug.get(icon.toolkit))}
          size="sm"
        />
      );
    },
    [toolkitsBySlug],
  );
}
