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
