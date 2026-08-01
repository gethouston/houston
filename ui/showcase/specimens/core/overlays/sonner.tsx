import { Toaster } from "@houston-ai/core";
import { storeSurface, storeType } from "@houston-ai/store";
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { ComponentType } from "react";

import {
  type Specimen,
  SpecimenPage,
  type SpecimenProp,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";

/**
 * The five toast types `Toaster` overrides an icon for, read straight off
 * `ui/core/src/components/sonner.tsx`. Nothing here is a mock toast: it is the
 * icon set the component injects, rendered at the size it injects it (`size-4`).
 */
const icons: { type: string; Icon: ComponentType<{ className?: string }> }[] = [
  { type: "success", Icon: CircleCheckIcon },
  { type: "info", Icon: InfoIcon },
  { type: "warning", Icon: TriangleAlertIcon },
  { type: "error", Icon: OctagonXIcon },
  { type: "loading", Icon: Loader2Icon },
];

const props: SpecimenProp[] = [
  {
    name: "theme",
    type: '"light" | "dark" | "system"',
    note: "Set by the component from next-themes; defaults to system. Override to pin it.",
  },
  {
    name: "icons",
    type: "ToastIcons",
    note: "Set by the component to the five Lucide icons above. Override per app.",
  },
  {
    name: "style",
    type: "React.CSSProperties",
    note: "Set by the component to the four CSS variables below. Merging replaces them.",
  },
  {
    name: "className",
    type: "string",
    note: 'Set by the component to "toaster group".',
  },
  {
    name: "position",
    type: '"top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right"',
    note: "Forwarded to sonner. Default bottom-right.",
  },
  {
    name: "duration",
    type: "number",
    note: "Forwarded to sonner. Default 4s.",
  },
  {
    name: "visibleToasts",
    type: "number",
    note: "Forwarded to sonner. How many stack before collapsing.",
  },
  {
    name: "closeButton",
    type: "boolean",
    note: "Forwarded to sonner. Adds an X to every toast.",
  },
  {
    name: "expand",
    type: "boolean",
    note: "Forwarded to sonner. Keeps the stack expanded instead of collapsed.",
  },
  {
    name: "richColors",
    type: "boolean",
    note: "Forwarded to sonner. Do not use — it paints its own palette, off-token.",
  },
];

function SonnerSpecimen() {
  return (
    <SpecimenPage
      title="Toaster (sonner)"
      intro="The sonner mount point, themed to Houston's tokens. It renders nothing until something calls sonner's toast() — the live Toaster below is mounted and waiting."
    >
      <SpecimenSection
        title="Variants"
        note="The five toast types the component overrides an icon for. These are the injected icons themselves, not a rendering of a toast."
      >
        <SpecimenRow label="Icon set">
          {icons.map(({ type, Icon }) => (
            <span
              key={type}
              className={`${storeSurface.chip} font-mono tabular-nums`}
            >
              <Icon
                className={
                  type === "loading" ? "size-4 animate-spin" : "size-4"
                }
              />
              {type}
            </span>
          ))}
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Mounted and empty is the only state this component owns; every other state belongs to the toasts sonner puts inside it."
      >
        <SpecimenRow label="Mounted, empty">
          <span className={storeType.meta}>
            A live `Toaster` is mounted on this page. With no toast in flight it
            paints nothing and reserves no space.
          </span>
        </SpecimenRow>
        <SpecimenRow label="No live trigger here">
          <span className={storeType.meta}>
            Firing one needs `toast()` from the `sonner` package, and
            `@houston-ai/showcase` does not depend on `sonner` — only
            `@houston-ai/core` does. Nothing on this page fakes a toast. For a
            queue you can actually push, see ToastContainer, which is the stack
            Houston ships.
          </span>
        </SpecimenRow>
        <SpecimenRow label="Theme">
          <span className={storeType.meta}>
            The surface resolves `--popover`, `--popover-text`, `--border` and
            `--radius`, so it follows the theme switch above with no extra
            wiring.
          </span>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={props} />
      <SpecimenTokens
        classes={[
          "--normal-bg: var(--popover)",
          "--normal-text: var(--popover-text)",
          "--normal-border: var(--border)",
          "--border-radius: var(--radius)",
        ]}
      />

      <Toaster />
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = ["Toaster"];

export const specimen: Specimen = {
  id: "core-sonner",
  title: "Toaster (sonner)",
  group: "Overlays",
  render: () => <SonnerSpecimen />,
};
