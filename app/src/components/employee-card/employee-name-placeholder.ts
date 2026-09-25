/**
 * The example names an empty name field shows. A card that knows the job
 * leads with it ("e.g. Branch manager, Assistant 3, Jerry"); a field with no
 * job to go on (a copy, an import) shows the examples alone.
 */
export type EmployeeNamePlaceholder =
  | { key: "employeeCard.namePlaceholderForRole"; values: { role: string } }
  | { key: "employeeCard.namePlaceholder"; values?: undefined };

const GENERIC: EmployeeNamePlaceholder = {
  key: "employeeCard.namePlaceholder",
};

/** Room the text keeps free of the field's edge, so sub-pixel rounding never
 *  clips its last glyph. */
const FIT_SLACK_PX = 2;

export function employeeNamePlaceholder(
  role: string | undefined,
): EmployeeNamePlaceholder {
  const known = role?.trim() ?? "";
  if (known === "") return GENERIC;
  return {
    key: "employeeCard.namePlaceholderForRole",
    values: { role: known },
  };
}

/**
 * The placeholder the field shows: `preferred` when its text, `textWidth`
 * wide, fits the field's `availableWidth` whole; otherwise the examples alone,
 * so a placeholder is never cut short.
 */
export function fittingNamePlaceholder(
  preferred: EmployeeNamePlaceholder,
  textWidth: number,
  availableWidth: number,
): EmployeeNamePlaceholder {
  return textWidth + FIT_SLACK_PX <= availableWidth ? preferred : GENERIC;
}
