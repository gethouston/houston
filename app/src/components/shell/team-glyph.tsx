import { resolveAgentColor } from "@houston-ai/core";
import { isSidebarGroupGlyph, SidebarGroupGlyph } from "@houston-ai/layout";
import { Users } from "lucide-react";
import type { ReactElement } from "react";
import type { TeamView } from "../../lib/teams-model";

/**
 * The mark a team wears, everywhere a team is drawn: its block header in the
 * rail, row 1 of its own screen, and the rows of the "Move to team" picker. ONE
 * component for all of them, so no two surfaces can disagree about what a team
 * looks like.
 *
 * **A team's glyph DOES pin a colour, and that bends `sidebar-anatomy.md`'s
 * third invariant on purpose.** That rule ("a row's glyph never pins a colour",
 * so an active row brightens as one object) still governs every other row in
 * the rail. A team is the exception because its colour is not decoration: it is
 * identity the user picked, the same thing an agent's helmet colour is, and it
 * is a product decision by Julian. It rides the AGENT mechanism rather than a
 * second palette — one vocabulary, one set of tokens — so a team and an agent
 * can never drift into two different meanings of "purple".
 *
 * The untouched case is unchanged: with no colour chosen no style is set at
 * all, the glyph inherits the row's own ink, and the header still brightens as
 * one object exactly as invariant 3 asks.
 *
 * An icon NAME this client does not know degrades to the neutral `Users` mark,
 * never to a hole: a server host may hold a glyph from a newer client's
 * vocabulary, and a team with no mark at all would read as a broken row.
 */
export function TeamGlyph({
  team,
  className = "size-3.5",
}: {
  team: TeamView;
  /** Defaults to the rail's own 14px box; Team Settings asks for 20px. */
  className?: string;
}): ReactElement {
  const mark = isSidebarGroupGlyph(team.icon) ? (
    <SidebarGroupGlyph name={team.icon} className={className} />
  ) : (
    <Users className={className} />
  );
  if (!team.color) return mark;
  // Through an inline style custom-property value, never a class name: the
  // stored value is user-pickable and may be a raw `#rrggbb` a server host
  // holds, which no Tailwind class can express. `resolveAgentColor` maps a
  // palette id to its theme-reactive `var(--ht-agent-*)` (so the browser
  // recolours on a theme flip with no re-render) and passes a hex through
  // verbatim. Exactly how an agent avatar wears its colour.
  return (
    <span className="flex" style={{ color: resolveAgentColor(team.color) }}>
      {mark}
    </span>
  );
}
