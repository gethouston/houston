import { Badge } from "@houston-ai/core";
import type { IntegrationLabel } from "@houston-ai/store";
import { Plug } from "lucide-react";

export function IntegrationChips({
  integrations,
}: {
  integrations: IntegrationLabel[];
}) {
  return (
    <ul className="flex flex-wrap gap-2">
      {integrations.map(({ slug, label }) => (
        <li key={slug}>
          <Badge variant="secondary" className="gap-1.5 px-3 py-1 text-sm">
            <Plug aria-hidden className="size-3.5" />
            {label}
          </Badge>
        </li>
      ))}
    </ul>
  );
}
