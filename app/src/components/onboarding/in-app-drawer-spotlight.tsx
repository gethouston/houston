import { useIsMobile } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useUIStore } from "../../stores/ui";
import { tourSelector } from "../shell/workspace-tour-steps.ts";
import { TutorialSpotlight } from "../tutorial";
import { drawerSpotPhase } from "./in-app-mobile-targets";

/**
 * A spotlight on a sidebar row (AI Models, Integrations, New agent).
 *
 * On desktop the rail is always on the glass, so this IS the plain spotlight.
 * Below md the rail is hosted in a drawer (a Sheet) behind the top bar's
 * hamburger: while the drawer is shut the row is not in the DOM, so the step
 * first rings the hamburger, and once the drawer is open it rings the row
 * INSIDE it in the in-dialog mode — the Sheet is a Radix dialog, the same
 * layering the create-agent dialog coaching rides. Tapping the row navigates
 * and closes the drawer, and the step advances on the app state it always
 * advanced on. A structural fork (`useIsMobile`): the target tree differs,
 * not its layout.
 */
export function DrawerSpotlight(props: {
  selector: string;
  title: string;
  hint?: string;
  aside?: string;
  asideCta?: string;
  onAsideCta?: () => void;
}) {
  const { t } = useTranslation("setup");
  const isMobile = useIsMobile();
  const drawerOpen = useUIStore((s) => s.mobileSidebarOpen);
  const phase = drawerSpotPhase({ isMobile, drawerOpen });
  if (phase === "rail") return <TutorialSpotlight {...props} />;
  if (phase === "inDrawer") return <TutorialSpotlight inDialog {...props} />;
  return (
    <TutorialSpotlight
      selector={tourSelector("mobileMenu")}
      title={t("inApp.steps.openMenu.title")}
      hint={t("inApp.steps.openMenu.hint")}
      aside={props.aside}
      asideCta={props.asideCta}
      onAsideCta={props.onAsideCta}
    />
  );
}
