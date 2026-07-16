import { CatalogRow, HoustonAvatar } from "@houston-ai/core";
import { ChevronRight } from "lucide-react";

interface PermissionsAgentRowProps {
  name: string;
  color?: string;
  /** ONE truncated plain-language summary line (who can use it, who manages
   *  it) — already composed and translated by the list. */
  summary: string;
  /** Accessible label for the open action (already translated). */
  openLabel: string;
  onOpen: () => void;
}

/**
 * One agent row on the Permissions plane. Follows the app's flat page language
 * (the Integrations page is the reference): transparent at rest, `hover` fill,
 * avatar + name over one muted summary line, ONE quiet trailing chevron. The
 * whole row opens the agent's permission card; no hover-only affordances, no
 * bordered card chrome.
 */
export function PermissionsAgentRow({
  name,
  color,
  summary,
  openLabel,
  onOpen,
}: PermissionsAgentRowProps) {
  return (
    <CatalogRow
      icon={<HoustonAvatar color={color} diameter={40} />}
      title={name}
      description={summary}
      aria-label={openLabel}
      onClick={onOpen}
      trailing={
        <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-muted" />
      }
    />
  );
}
