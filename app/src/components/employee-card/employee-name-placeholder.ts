export type EmployeeNamePlaceholder =
  | { key: "employeeCard.namePlaceholderForRole"; values: { role: string } }
  | { key: "employeeCard.namePlaceholder"; values?: undefined };

const GENERIC: EmployeeNamePlaceholder = {
  key: "employeeCard.namePlaceholder",
};

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

export function fittingNamePlaceholder(
  preferred: EmployeeNamePlaceholder,
  textWidth: number,
  availableWidth: number,
): EmployeeNamePlaceholder {
  return textWidth + FIT_SLACK_PX <= availableWidth ? preferred : GENERIC;
}
