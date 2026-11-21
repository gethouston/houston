import { createContext, useContext } from "react";

const DetailPanelContext = createContext<HTMLDivElement | null>(null);

export const DetailPanelProvider = DetailPanelContext.Provider;

export function useDetailPanelContainer() {
  return useContext(DetailPanelContext);
}
