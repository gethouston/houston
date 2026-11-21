import { Badge } from "@houston-ai/core";
import { appDisplay } from "./app-display";
import { AppLogo } from "./app-logo";
import { useToolkitBySlug } from "./use-toolkit-catalog";

export function IntegrationBadges({
  toolkits,
  label,
}: {
  toolkits: string[];
  label?: string;
}) {
  const bySlug = useToolkitBySlug();

  if (toolkits.length === 0) return null;
  return (
    <div>
      {label && <p className="mb-1.5 font-medium text-ink text-sm">{label}</p>}
      <div className="flex flex-wrap gap-1.5">
        {toolkits.map((slug) => {
          const display = appDisplay(slug, bySlug.get(slug));
          return (
            <Badge key={slug} variant="outline" className="gap-1.5 py-0.5 pl-1">
              <AppLogo display={display} size="xs" />
              {display.name}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}
