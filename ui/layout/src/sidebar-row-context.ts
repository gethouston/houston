export interface SidebarRowContext {
  selectedId?: string | null;
  onSelect: (id: string) => void;
}

export type SidebarBaseRowContext = SidebarRowContext;
