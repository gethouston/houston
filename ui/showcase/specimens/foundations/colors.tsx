import type { Specimen } from "../../src/specimen";
import { SpecimenPage, SpecimenSection } from "../../src/specimen";
import { ColorRow } from "./color-row";
import { COLOR_TOKEN_GROUPS, COLOR_TOKEN_NAMES } from "./color-tokens";
import { EffectsSection } from "./effects";
import { useTokenValues } from "./use-live-theme";

function ColorsSpecimen() {
  const values = useTokenValues(COLOR_TOKEN_NAMES);
  return (
    <SpecimenPage
      title="Colors"
      intro={`The ${COLOR_TOKEN_NAMES.length} semantic tokens every Houston surface paints with. Values are read live from the document, so what you see is what the theme on screen actually resolves.`}
    >
      {COLOR_TOKEN_GROUPS.map((group) => (
        <SpecimenSection
          key={group.title}
          title={group.title}
          note={group.note}
        >
          {group.tokens.map((token) => (
            <ColorRow
              key={token.name}
              token={token}
              value={values[token.name]}
            />
          ))}
        </SpecimenSection>
      ))}

      <EffectsSection />
    </SpecimenPage>
  );
}

export const sources: string[] = [];

export const specimen: Specimen = {
  id: "foundations-colors",
  title: "Colors",
  group: "Foundations",
  render: () => <ColorsSpecimen />,
};
