import type { SpecimenProp } from "../../../src/specimen";

/** The sidebar's public API, read off `ui/core/src/components/sidebar.tsx`. */
export const sidebarProps: SpecimenProp[] = [
  {
    name: "SidebarProvider.defaultOpen / open / onOpenChange",
    type: "boolean | (open: boolean) => void",
    note: "Owns the open state, persists it to the sidebar_state cookie, binds ⌘B.",
  },
  {
    name: "Sidebar.side",
    type: '"left" | "right"',
    note: 'Defaults to "left". Which edge the fixed rail pins to.',
  },
  {
    name: "Sidebar.variant",
    type: '"sidebar" | "floating" | "inset"',
    note: 'Defaults to "sidebar". Floating rounds and outlines the rail; inset insets the page beside it.',
  },
  {
    name: "Sidebar.collapsible",
    type: '"offcanvas" | "icon" | "none"',
    note: 'Defaults to "offcanvas". "icon" keeps a 3rem rail; "none" is a plain in-flow column.',
  },
  {
    name: "SidebarMenuButton.variant",
    type: '"default" | "outline"',
    note: 'Defaults to "default".',
  },
  {
    name: "SidebarMenuButton.size",
    type: '"default" | "sm" | "lg"',
    note: "32 / 28 / 48px tall.",
  },
  {
    name: "SidebarMenuButton.isActive",
    type: "boolean",
    note: "The current route: accent background, medium weight.",
  },
  {
    name: "SidebarMenuButton.tooltip",
    type: "string | TooltipContentProps",
    note: "Shown to the right, only while the rail is collapsed on desktop.",
  },
  {
    name: "SidebarMenuButton.asChild",
    type: "boolean",
    note: "Render as your own element — a router Link, most often.",
  },
  {
    name: "SidebarMenuAction.showOnHover",
    type: "boolean",
    note: "Hides the row action until the row is hovered or focused.",
  },
  {
    name: "SidebarMenuSubButton.size",
    type: '"sm" | "md"',
    note: 'Defaults to "md".',
  },
  {
    name: "SidebarMenuSkeleton.showIcon",
    type: "boolean",
    note: "Adds a square icon placeholder before the text bar.",
  },
  {
    name: "useSidebar()",
    type: "{ state, open, setOpen, openMobile, setOpenMobile, isMobile, toggleSidebar }",
    note: "The context every part reads. Throws outside a SidebarProvider.",
  },
];

/** Every colour utility the sidebar parts paint with. */
export const sidebarTokens = [
  "bg-sidebar",
  "text-sidebar-text",
  "bg-sidebar-hover",
  "text-sidebar-hover-text",
  "border-sidebar-line",
  "bg-sidebar-line",
  "ring-sidebar-ring",
  "text-sidebar-text/70",
  "bg-input",
];
