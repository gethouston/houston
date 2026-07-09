import { parseAnonymizeResult } from "./anonymize-parse";

/**
 * Parsing for the skill-translate one-shot response. The model returns
 * `{"items":[{"id","text"}]}`; every requested id must come back exactly once
 * (a dropped item would silently leave a surface untranslated with no error,
 * so a missing id is a hard failure). Extra/unknown ids are ignored.
 *
 * Delegates to the anonymize reply parser — the wire shape is identical
 * minus `summary` — so hardening fixes to the fence-stripping / missing-id
 * handling apply to both one-shots at once.
 */

export interface TranslateItemInput {
  id: string;
  text: string;
}

export interface TranslateItemResult {
  id: string;
  text: string;
}

export function parseTranslateResult(
  raw: string,
  requested: TranslateItemInput[],
): TranslateItemResult[] {
  return parseAnonymizeResult(raw, requested).map(({ id, text }) => ({
    id,
    text,
  }));
}
