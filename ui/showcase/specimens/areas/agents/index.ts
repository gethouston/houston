import type { Specimen } from "../../../src/specimen";
import { specimen as appSidebar } from "./app-sidebar";
import { specimen as filesBrowser } from "./files-browser";
import { specimen as instructionsPanel } from "./instructions-panel";
import { specimen as sidebarGroupHeader } from "./sidebar-group-header";
import { specimen as sidebarNavItem } from "./sidebar-nav-item";
import { specimen as splitView } from "./split-view";
import { specimen as tabBar } from "./tab-bar";
import { specimen as workspaceSwitcher } from "./workspace-switcher";

/**
 * The **Your Agents** area: the frame the product lives in — the rail of
 * agents and its groups, the workspace switcher above it, the tab strip over
 * an agent's workspace — and the two surfaces behind Agent Settings.
 *
 * One file per component in this folder (`<component>.tsx`, each exporting
 * `export const specimen: Specimen` with `group: "Your Agents"` alongside
 * `export const sources: string[]`), imported here and listed below in the
 * order a user meets them: the rail from the outside in, then the tab strip
 * and the split beneath it, then the panels those tabs open. Shared sample
 * content lives in `sample.tsx`; the live wiring and the props tables sit in
 * the `*-parts.tsx` / `*-api.ts` / `*-sample.ts` helpers beside each page.
 *
 * The agent avatar itself is deliberately not here: `AgentAvatar` and
 * `HoustonAvatar` are `@houston-ai/core` primitives, documented under Data
 * display and merely *used* by this area's sample content.
 */
export const specimens: readonly Specimen[] = [
  workspaceSwitcher,
  sidebarNavItem,
  sidebarGroupHeader,
  appSidebar,
  tabBar,
  splitView,
  instructionsPanel,
  filesBrowser,
];
