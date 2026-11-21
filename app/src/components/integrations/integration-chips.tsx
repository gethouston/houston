import { appDisplay } from "./app-display";
import { AppLogo } from "./app-logo";
import { useToolkitBySlug } from "./use-toolkit-catalog";

interface Props {
  slugs: string[];
  max?: number;
}

export function IntegrationChips({ slugs, max = 6 }: Props) {
  const bySlug = useToolkitBySlug();

  if (slugs.length === 0) return null;
  const shown = slugs.slice(0, max);
  const extra = slugs.length - shown.length;
  return (
    <div className="flex items-center gap-1.5">
      {shown.map((slug) => {
        const display = appDisplay(slug, bySlug.get(slug));
        return (
          <span key={slug} title={display.name} className="flex">
            <AppLogo
              display={display}
              size="xs"
              className="rounded-sm bg-input"
            />
          </span>
        );
      })}
      {extra > 0 && (
        <span
          aria-hidden="true"
          className="text-[10px] font-medium text-ink-muted"
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
