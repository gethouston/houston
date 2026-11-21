import { cn } from "../utils";

export type CatalogRowSurface = "plane" | "card";

export function catalogRowSurfaceClasses(
  surface: CatalogRowSurface,
  interactive: boolean,
): { root: string; body: string } {
  if (surface === "plane")
    return {
      root: "",
      body: "focus-visible:ring-2 focus-visible:ring-focus/40",
    };
  return {
    root: cn(
      "bg-card outline-1 -outline-offset-1 outline-line",
      "has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-focus",
      interactive && "active:scale-[0.98]",
    ),
    body: "",
  };
}
