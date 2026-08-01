import { SkillMarketplaceRow } from "@houston-ai/skills";
import type { ReactNode } from "react";
import { useState } from "react";

import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { communitySkills, delay } from "./sample";
import { rowProps } from "./skill-marketplace-row-parts";

const [contracts, triage, notes, , oneInstall, noInstalls] = communitySkills;

/** One grid cell of the marketplace's two-column layout. */
function Measure({ children }: { children: ReactNode }) {
  return <div className="w-full max-w-md">{children}</div>;
}

/** Install for real: idle → installing → installed, on a timer. */
function LiveRow() {
  const [status, setStatus] = useState<"idle" | "installing" | "installed">(
    "idle",
  );
  const [opened, setOpened] = useState(false);
  return (
    <div className="flex w-full max-w-md flex-col gap-2">
      <SkillMarketplaceRow
        skill={contracts}
        installing={status === "installing"}
        installed={status === "installed"}
        onInstall={async () => {
          setStatus("installing");
          await delay(1400);
          setStatus("installed");
        }}
        onOpenInfo={() => setOpened(true)}
      />
      <p className="text-[13px] text-ink-muted leading-[1.4]">
        {opened
          ? "The row body opens the preview modal; the + installs without leaving the grid."
          : "Press + to install, or click the row to open it."}
      </p>
    </div>
  );
}

function SkillMarketplaceRowSpecimen() {
  return (
    <SpecimenPage
      title="Marketplace skill row"
      intro="A skills.sh result in the shared catalog grammar: owner avatar, humanized title, `by owner · installs`. The body opens the preview; the + installs in place."
    >
      <SpecimenSection
        title="Variants"
        note="No style variants — the subtitle varies with the skill. A skill nobody has installed yet shows its owner alone, and the install count is singular at one."
      >
        <SpecimenRow label="With installs">
          <Measure>
            <SkillMarketplaceRow
              skill={contracts}
              installing={false}
              installed={false}
              onInstall={() => undefined}
              onOpenInfo={() => undefined}
            />
          </Measure>
        </SpecimenRow>
        <SpecimenRow label="One install">
          <Measure>
            <SkillMarketplaceRow
              skill={oneInstall}
              installing={false}
              installed={false}
              onInstall={() => undefined}
              onOpenInfo={() => undefined}
            />
          </Measure>
        </SpecimenRow>
        <SpecimenRow label="No installs yet">
          <Measure>
            <SkillMarketplaceRow
              skill={noInstalls}
              installing={false}
              installed={false}
              onInstall={() => undefined}
              onOpenInfo={() => undefined}
            />
          </Measure>
        </SpecimenRow>
        <SpecimenRow label="Translated labels">
          <Measure>
            <SkillMarketplaceRow
              skill={notes}
              installing={false}
              installed={false}
              onInstall={() => undefined}
              onOpenInfo={() => undefined}
              labels={{
                bySource: (owner) => `de ${owner}`,
                installsCount: (count, formatted) =>
                  count === 1
                    ? `${formatted} instalación`
                    : `${formatted} instalaciones`,
                installAria: (name) => `Instalar ${name}`,
              }}
            />
          </Measure>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="`installing` and `installed` are the whole machine, and they are per-skill: installing one row never dims its neighbours. Installed swaps the + for a quiet check and adds the green presence dot, so the two read apart at a glance."
      >
        <SpecimenRow label="Idle">
          <Measure>
            <SkillMarketplaceRow
              skill={triage}
              installing={false}
              installed={false}
              onInstall={() => undefined}
              onOpenInfo={() => undefined}
            />
          </Measure>
        </SpecimenRow>
        <SpecimenRow label="Installing">
          <Measure>
            <SkillMarketplaceRow
              skill={triage}
              installing
              installed={false}
              onInstall={() => undefined}
              onOpenInfo={() => undefined}
            />
          </Measure>
        </SpecimenRow>
        <SpecimenRow label="Installed">
          <Measure>
            <SkillMarketplaceRow
              skill={triage}
              installing={false}
              installed
              onInstall={() => undefined}
              onOpenInfo={() => undefined}
            />
          </Measure>
        </SpecimenRow>
        <SpecimenRow label="Live">
          <LiveRow />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={rowProps} />

      <SpecimenTokens
        classes={[
          "text-ink",
          "text-ink-muted",
          "hover:bg-hover",
          "focus-within:bg-hover",
          "bg-success",
          "bg-chip",
        ]}
      />
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = ["SkillMarketplaceRow"];

export const specimen: Specimen = {
  id: "skills-marketplace-row",
  title: "Marketplace skill row",
  group: "Skills",
  render: () => <SkillMarketplaceRowSpecimen />,
};
