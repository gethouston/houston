import {
  StorePage,
  StorePageHeader,
  StoreSection,
  storeDensity,
  storeSurface,
  storeType,
} from "@houston-ai/store";

import type { Specimen } from "../../../src/specimen";
import {
  type ColorRole,
  colorSwatchStyle,
  inkRoles,
  spacingSteps,
  surfaceRoles,
  typeRoles,
} from "./design-sheet-parts";

function RoleRow({ role }: { role: ColorRole }) {
  return (
    <div className="flex items-center gap-4">
      <div
        style={colorSwatchStyle(role.token)}
        className="size-10 shrink-0 rounded-lg border border-line"
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <code className={storeType.body}>{role.utility}</code>
        <span className={storeType.meta}>
          {role.token} · {role.use}
        </span>
      </div>
    </div>
  );
}

/**
 * The design language, rendered from the real tokens and the real primitives —
 * the page to eyeball (in both themes) before approving the direction.
 *
 * A language sheet, not a component page, so it owns its own frame instead of
 * the Variants / States / Sizes scaffold every component specimen follows.
 */
function DesignSheet() {
  return (
    <StorePage>
      <StorePageHeader
        title="The store design language"
        subtitle="Air, four type roles, flat surfaces, one accent. Rendered from the live --ht-* tokens."
        actions={
          <button type="button" className={storeSurface.ctaPrimary}>
            Primary action
          </button>
        }
      />

      <StoreSection
        title="Type"
        description="System stack only. Nothing in the store is typed outside these four roles."
      >
        <div className={storeSurface.card}>
          <div className="flex flex-col gap-8">
            {typeRoles.map((role) => (
              <div key={role.name} className="flex flex-col gap-2">
                <span className={storeType.meta}>
                  {role.name} — {role.spec}
                </span>
                <p className={role.className}>{role.sample}</p>
              </div>
            ))}
          </div>
        </div>
      </StoreSection>

      <StoreSection
        title="Spacing"
        description="Six steps. Every gap on a store screen is one of them."
      >
        <div className={storeSurface.panel}>
          <div className="flex flex-col gap-4">
            {spacingSteps.map((step) => (
              <div key={step.utility} className="flex items-center gap-4">
                <code
                  className={`${storeType.meta} w-28 shrink-0 tabular-nums`}
                >
                  {step.utility}
                </code>
                <div
                  style={{ width: `${step.px}px` }}
                  className="h-4 shrink-0 rounded-sm bg-ink-muted"
                />
                <span className={`${storeType.meta} tabular-nums`}>
                  {step.px}px · {step.use}
                </span>
              </div>
            ))}
          </div>
        </div>
      </StoreSection>

      <StoreSection
        title="Surfaces"
        description="Flat in both themes. Hover shifts colour, never position."
      >
        <div className={`${storeDensity.grid} sm:grid-cols-3`}>
          <div className={storeSurface.card}>
            <p className={storeType.body}>Card</p>
            <p className={`${storeType.meta} mt-1`}>
              bg-card · border-line · rounded-2xl · no shadow
            </p>
          </div>
          <div className={storeSurface.cardInteractive}>
            <p className={storeType.body}>Card, interactive</p>
            <p className={`${storeType.meta} mt-1`}>
              Hover me: background and border only, 150ms
            </p>
          </div>
          <div className={storeSurface.panel}>
            <p className={storeType.body}>Panel</p>
            <p className={`${storeType.meta} mt-1`}>
              bg-chip-subtle, one step below the card tier
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className={storeSurface.chip}>Productivity</span>
          <span className={storeSurface.chip}>Verified publisher</span>
          <button type="button" className={storeSurface.ctaSecondary}>
            Secondary action
          </button>
          <button type="button" className={storeSurface.ctaPrimary}>
            Primary action
          </button>
        </div>
      </StoreSection>

      <StoreSection
        title="Colour"
        description="Neutral surfaces, neutral text. The accent is rationed to one control per view."
      >
        <div className={`${storeDensity.grid} sm:grid-cols-2`}>
          <div className={storeSurface.card}>
            <div className="flex flex-col gap-4">
              <span className={storeType.meta}>Surfaces</span>
              {surfaceRoles.map((role) => (
                <RoleRow key={role.token} role={role} />
              ))}
            </div>
          </div>
          <div className={storeSurface.card}>
            <div className="flex flex-col gap-4">
              <span className={storeType.meta}>Ink and action</span>
              {inkRoles.map((role) => (
                <RoleRow key={role.token} role={role} />
              ))}
            </div>
          </div>
        </div>
      </StoreSection>
    </StorePage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = [
  "storeDensity",
  "storeMotion",
  "storeSurface",
  "storeType",
];

export const specimen: Specimen = {
  id: "store-design-sheet",
  title: "Design sheet",
  group: "Agent Store",
  render: () => <DesignSheet />,
};
