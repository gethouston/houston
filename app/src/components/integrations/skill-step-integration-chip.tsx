import type { SkillStepIntegration } from "@houston-ai/skills";
import { humanizeIntegrationAction } from "@houston-ai/skills";
import { appDisplay } from "./app-display";
import { AppLogo } from "./app-logo";
import { useToolkitBySlug } from "./use-toolkit-catalog";

/**
 * The app a workflow step runs on, as a chip beside the step's title: the
 * real brand mark and the real app name from the Composio catalog, plus the
 * action spoken as a phrase ("Send email"). `@houston-ai/skills` can only show
 * the machine slug on its own, so every app surface that renders steps passes
 * this in as `renderIntegration` — the skill editor, the two skill previews
 * and the manage dialog's body all resolve an app the same way.
 */
export function SkillStepIntegrationChip({
  integration,
}: {
  integration: SkillStepIntegration;
}) {
  const bySlug = useToolkitBySlug();
  const display = appDisplay(
    integration.toolkit,
    bySlug.get(integration.toolkit),
  );
  const action = humanizeIntegrationAction(
    integration.toolkit,
    integration.action,
  );

  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-chip py-0.5 pr-2 pl-1 text-chip-text text-xs">
      <AppLogo display={display} size="xs" />
      <span className="min-w-0 break-words">
        {action ? `${display.name} · ${action}` : display.name}
      </span>
    </span>
  );
}
