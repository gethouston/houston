import {
  type HoustonFamily,
  normalizeActivities,
  normalizeLearnings,
  normalizeRoutineRuns,
  normalizeRoutines,
  parseJsonDoc,
} from "@houston/domain";

const emptyDoc = (family: HoustonFamily) => (family === "config" ? {} : []);

export function familyDoc(
  family: HoustonFamily,
  raw: string | null,
  key: string,
): unknown {
  if (raw === null) return emptyDoc(family);
  let parsed: unknown;
  try {
    parsed = parseJsonDoc(raw, key);
  } catch {
    return undefined;
  }
  return normalizeFamily(family, parsed, key);
}

function normalizeFamily(
  family: HoustonFamily,
  parsed: unknown,
  key: string,
): unknown {
  switch (family) {
    case "activity":
      return normalizeActivities(parsed, key).items;
    case "routines":
      return normalizeRoutines(parsed, key).items;
    case "routine_runs":
      return normalizeRoutineRuns(parsed, key).items;
    case "learnings":
      return normalizeLearnings(parsed, key).items;
    case "config":
      return parsed !== null &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
        ? parsed
        : {};
    default:
      return parsed;
  }
}
