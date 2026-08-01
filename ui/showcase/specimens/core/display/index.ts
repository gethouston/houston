import type { Specimen } from "../../../src/specimen";
import { specimen as agentAvatar } from "./agent-avatar";
import { specimen as alert } from "./alert";
import { specimen as avatar } from "./avatar";
import { specimen as badge } from "./badge";
import { specimen as card } from "./card";
import { specimen as empty } from "./empty";
import { specimen as highlightedText } from "./highlighted-text";
import { specimen as houstonAvatar } from "./houston-avatar";
import { specimen as progress } from "./progress";
import { specimen as separator } from "./separator";
import { specimen as skeleton } from "./skeleton";
import { specimen as spinner } from "./spinner";
import { specimen as statusBadge } from "./status-badge";
import { specimen as verifiedBadge } from "./verified-badge";

/**
 * The "Data display" family: cards, badges, avatars, progress, skeletons —
 * anything that presents data at rest.
 *
 * One file per component in this folder (`<component>.tsx`, each exporting
 * `export const specimen: Specimen` with `group: "Data display"`), imported
 * here and listed below in nav order: the badges first, then the avatars, then
 * the containers, then the thin presentational primitives. The layout helpers
 * live in `../../../src/specimen`.
 */
export const specimens: readonly Specimen[] = [
  badge,
  statusBadge,
  verifiedBadge,
  avatar,
  agentAvatar,
  houstonAvatar,
  card,
  empty,
  highlightedText,
  separator,
  skeleton,
  spinner,
  progress,
  alert,
];
