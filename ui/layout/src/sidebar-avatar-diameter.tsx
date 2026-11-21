import { createContext, useContext } from "react";
import { sidebarPersonRow } from "./sidebar-geometry";

const SidebarAvatarDiameterContext = createContext<number>(
  sidebarPersonRow.avatarDiameter,
);

export const SidebarAvatarDiameter = SidebarAvatarDiameterContext.Provider;

export function useSidebarAvatarDiameter(): number {
  return useContext(SidebarAvatarDiameterContext);
}
