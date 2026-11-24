import { createContext, useContext } from "react";
import { sidebarPersonRow } from "./sidebar-geometry";

const SidebarAvatarDiameterContext = createContext<number>(
  sidebarPersonRow.avatarDiameter,
);

/**
 * The diameter an AI Employee's avatar takes where it is mounted: the person
 * row's portrait by default, {@link sidebarCollapsedItem}'s smaller avatar
 * inside the collapsed rail's square. The host builds ONE icon node per item
 * and the rail renders it in both places, so the rail, not the host, says how
 * big it is there.
 */
export const SidebarAvatarDiameter = SidebarAvatarDiameterContext.Provider;

/** The avatar diameter of the rail slot this node renders in. */
export function useSidebarAvatarDiameter(): number {
  return useContext(SidebarAvatarDiameterContext);
}
