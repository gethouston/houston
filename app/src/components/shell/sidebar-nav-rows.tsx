import { Building2, GraduationCap, Settings } from "lucide-react";
import {
  ACADEMY_VIEW_ID,
  ADMIN_VIEW_ID,
  SETTINGS_VIEW_ID,
} from "../../lib/top-level-views";
import type { MenuRow } from "./menu-row";
import { tourAnchor } from "./workspace-tour-steps.ts";

export function adminNavRow(args: {
  label: string;
  onOpen: () => void;
}): MenuRow {
  return {
    id: ADMIN_VIEW_ID,
    label: args.label,
    icon: <Building2 className="h-4 w-4" />,
    onClick: args.onOpen,
    dataAttrs: { "data-testid": "rail-admin" },
  };
}

export function academyNavRow(args: {
  label: string;
  onOpen: () => void;
}): MenuRow {
  return {
    id: ACADEMY_VIEW_ID,
    label: args.label,
    icon: <GraduationCap className="h-4 w-4" />,
    onClick: args.onOpen,
    dataAttrs: tourAnchor("nav-academy"),
  };
}

export function settingsNavRow(args: {
  label: string;
  onOpen: () => void;
}): MenuRow {
  return {
    id: SETTINGS_VIEW_ID,
    label: args.label,
    icon: <Settings className="h-4 w-4" />,
    onClick: args.onOpen,
    dataAttrs: tourAnchor("nav-settings"),
  };
}
