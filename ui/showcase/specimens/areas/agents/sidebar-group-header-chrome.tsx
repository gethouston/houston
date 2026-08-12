import { Users } from "lucide-react";

/**
 * What the HOST puts on a team's header row, as opposed to what the header
 * itself draws: the team's mark. It is a prop, which is
 * how the library stays generic about what a block actually is.
 */

/**
 * The team's mark. Monochrome on purpose: the identity colour in this column
 * belongs to the agent avatars below it, and a second palette stacked directly
 * above them would compete with the one that carries real meaning.
 */
export function TeamGlyph() {
  return <Users className="size-4" />;
}
