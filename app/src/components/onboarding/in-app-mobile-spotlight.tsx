import { useIsMobile } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useUIStore } from "../../stores/ui";
import { tourSelector } from "../shell/workspace-tour-steps.ts";
import { TutorialSpotlight } from "../tutorial";
import { type MobileSpotHome, mobileSpotPhase } from "./in-app-mobile-targets";

/**
 * A spotlight on a control that lives in a different PLACE on the phone.
 *
 * On desktop every one of them is a rail row, always on the glass, so this IS
 * the plain spotlight. Below md the rail is gone: the long tail of
 * destinations lives in the nav bar's More menu, and creating an agent is a
 * control on the Agents home. Either way the step first rings the way IN (the
 * More button, or the Agents item) and then the real control once it is
 * reachable — inside the menu it rings in the `inDialog` mode, since the menu
 * is a Radix dialog and its own modality isolates the app. Tapping the control
 * does what it always did, and the step advances on the app state it always
 * advanced on. A structural fork (`useIsMobile`): the target tree differs, not
 * its layout.
 */
export function MobileSpotlight({
  home,
  ...spot
}: {
  /** Where the control lives on the phone: behind the More menu, or on the
   *  Agents home screen. */
  home: MobileSpotHome;
  selector: string;
  title: string;
  hint?: string;
  aside?: string;
  asideCta?: string;
  onAsideCta?: () => void;
}) {
  const { t } = useTranslation("setup");
  const isMobile = useIsMobile();
  const menuOpen = useUIStore((s) => s.mobileMoreOpen);
  const viewMode = useUIStore((s) => s.viewMode);
  const phase = mobileSpotPhase({ isMobile, home, menuOpen, viewMode });
  if (phase === "rail" || phase === "onScreen")
    return <TutorialSpotlight {...spot} />;
  if (phase === "inMenu") return <TutorialSpotlight inDialog {...spot} />;
  const wayIn =
    phase === "openMenu"
      ? {
          selector: tourSelector("mobileMenu"),
          title: t("inApp.steps.openMenu.title"),
          hint: t("inApp.steps.openMenu.hint"),
        }
      : {
          selector: tourSelector("mobileAgentsTab"),
          title: t("inApp.steps.openAgents.title"),
          hint: t("inApp.steps.openAgents.hint"),
        };
  return (
    <TutorialSpotlight
      {...wayIn}
      aside={spot.aside}
      asideCta={spot.asideCta}
      onAsideCta={spot.onAsideCta}
    />
  );
}
