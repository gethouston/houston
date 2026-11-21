import type { ReactNode } from "react";

export interface MenuRow {
  id: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  dataAttrs?: Record<string, string>;
}
