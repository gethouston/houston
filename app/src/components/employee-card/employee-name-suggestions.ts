// `.ts` extensions so the node test runner can load this module on its own.
import { sameAgentName, uniqueAgentName } from "../../lib/agent-name.ts";

/** The languages the suggested names are written for. */
export type NameSuggestionLocale = "en" | "es" | "pt";

/**
 * Friendly first names the Suggest button offers, per app language: short,
 * easy to say, and at home in that language. Names, not copy, so they live
 * here rather than in the locale files and never go through translation.
 */
export const EMPLOYEE_NAME_SUGGESTIONS: Record<
  NameSuggestionLocale,
  readonly string[]
> = {
  en: [
    "Ava",
    "Leo",
    "Maya",
    "Noah",
    "Iris",
    "Theo",
    "Nora",
    "Eli",
    "Ruby",
    "Sam",
    "Clara",
    "Owen",
    "Lucy",
    "Miles",
    "Hazel",
    "Felix",
  ],
  es: [
    "Lucía",
    "Mateo",
    "Sofía",
    "Diego",
    "Valentina",
    "Tomás",
    "Camila",
    "Martín",
    "Elena",
    "Gabriel",
    "Paula",
    "Andrés",
    "Julia",
    "Emilio",
    "Marina",
    "Pablo",
  ],
  pt: [
    "Ana",
    "Pedro",
    "Beatriz",
    "Rafael",
    "Helena",
    "Gustavo",
    "Laura",
    "Bruno",
    "Clara",
    "Lucas",
    "Marina",
    "Tiago",
    "Alice",
    "Davi",
    "Júlia",
    "Caio",
  ],
};

/** The suggestion list for an i18next language tag ("es-MX" reads as es). */
export function nameSuggestionLocale(language: string): NameSuggestionLocale {
  const base = language.toLowerCase().split("-")[0];
  return base === "es" || base === "pt" ? base : "en";
}

/**
 * Where a job's suggestions start in the list: a stable hash of the job, so
 * each job opens on its own name and three starters never suggest the same
 * one first.
 */
export function roleSuggestionOffset(role: string, length: number): number {
  let hash = 0;
  for (const char of role.trim().toLowerCase()) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 2147483647;
  }
  return length === 0 ? 0 : hash % length;
}

/**
 * The name one press of Suggest puts in the field. The first press for a job
 * opens at that job's offset; each further press moves one name on from the
 * one showing. Names another AI Employee holds (or the field already shows)
 * are stepped over, and when every name is taken the first one comes back
 * made unique ("Ava 2").
 */
export function suggestEmployeeName({
  locale,
  role,
  current,
  taken,
}: {
  locale: NameSuggestionLocale;
  role: string;
  current: string;
  taken: readonly string[];
}): string {
  const names = EMPLOYEE_NAME_SUGGESTIONS[locale];
  const showing = names.findIndex((name) => sameAgentName(name, current));
  const start =
    showing >= 0 ? showing + 1 : roleSuggestionOffset(role, names.length);
  for (let step = 0; step < names.length; step += 1) {
    const candidate = names[(start + step) % names.length];
    if (sameAgentName(candidate, current)) continue;
    if (!taken.some((name) => sameAgentName(name, candidate))) return candidate;
  }
  return uniqueAgentName(names[start % names.length], [...taken, current]);
}
