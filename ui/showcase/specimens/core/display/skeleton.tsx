import { Skeleton } from "@houston-ai/core";
import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";

function SkeletonSpecimen() {
  return (
    <SpecimenPage
      title="Skeleton"
      intro="The shape of content that has not arrived yet: a pulsing block on the hover token."
    >
      <SpecimenSection
        title="Variants"
        note="No `variant` prop — a skeleton is one pulsing rectangle, and the shape comes entirely from the classes you give it."
      >
        <SpecimenRow label="Line">
          <Skeleton className="h-4 w-48" />
        </SpecimenRow>
        <SpecimenRow label="Circle (avatar)">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="size-10 rounded-full" />
        </SpecimenRow>
        <SpecimenRow label="Block (thumbnail)">
          <Skeleton className="h-24 w-40" />
        </SpecimenRow>
        <SpecimenRow label="Pill (badge)">
          <Skeleton className="h-5 w-20 rounded-full" />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="One state: loading. It animates forever, so it must be unmounted the moment the data lands — never left as a permanent placeholder."
      >
        <SpecimenRow label="Agent row">
          <div className="flex w-full max-w-sm items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        </SpecimenRow>
        <SpecimenRow label="Store card">
          <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-line bg-card p-6">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </SpecimenRow>
        <SpecimenRow label="Loaded (for comparison)">
          <div className="flex w-full max-w-sm items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3">
            <div className="size-8 shrink-0 rounded-full bg-chip-subtle" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-[15px] leading-[1.55] text-ink">
                Inbox Zero
              </span>
              <span className="text-[13px] leading-[1.4] text-ink-muted">
                Last run 8 minutes ago
              </span>
            </div>
          </div>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Sizes"
        note="No size prop. Match the real element's box exactly, or the layout jumps when the data arrives."
      >
        <SpecimenRow label="Meta line (13px text)">
          <Skeleton className="h-3 w-24" />
        </SpecimenRow>
        <SpecimenRow label="Body line (15px text)">
          <Skeleton className="h-4 w-40" />
        </SpecimenRow>
        <SpecimenRow label="Section title (20px text)">
          <Skeleton className="h-5 w-56" />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps
        items={[
          {
            name: "className",
            type: "string",
            note: "The whole API: size, radius and any layout the placeholder needs.",
          },
          {
            name: "...props",
            type: 'React.ComponentProps<"div">',
            note: "Every div attribute. Add `aria-hidden` when a live region already announces the load.",
          },
        ]}
      />

      <SpecimenTokens classes={["bg-hover"]} />
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = ["Skeleton"];

export const specimen: Specimen = {
  id: "core-skeleton",
  title: "Skeleton",
  group: "Data display",
  render: () => <SkeletonSpecimen />,
};
