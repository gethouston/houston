/**
 * Pure share-flow logic shared by the export wizard's "Save as file" and
 * "Publish to the Agent Store" paths. Both run the SAME pick + anonymize
 * pipeline, so the selection/override shaping lives here once (unit-tested)
 * instead of being duplicated per action.
 */

import type {
  PortableAnonymizeResponse,
  PortableExportOverrides,
  PortableExportSelection,
  StorePublishRequest,
} from "@houston-ai/engine-client";
import { isStoreCategory } from "./store-categories.ts";

/** The pick step's selection (Sets while the user toggles rows). */
export interface WizardSelection {
  claudeMd: boolean;
  skillSlugs: Set<string>;
  routineIds: Set<string>;
  learningIds: Set<string>;
}

/** Per-item "keep the redaction" decisions from the anonymize review. */
export interface AnonymizeAccept {
  claudeMd: boolean;
  skills: Record<string, boolean>;
  routines: Record<string, boolean>;
  learnings: Record<string, boolean>;
}

/** The listing metadata the publish step collects (name is the agent's name). */
export interface ListingForm {
  description: string;
  tagline: string;
  category: string;
  tags: string[];
  creatorName: string;
  creatorUrl: string;
}

/** Tags are capped and de-duplicated so a listing can't carry noise. */
export const MAX_TAGS = 6;

/**
 * The default "keep" decisions for a completed anonymize pass: keep every
 * redaction except ones that emptied the item (those default to the original).
 */
export function acceptFor(result: PortableAnonymizeResponse): AnonymizeAccept {
  return {
    claudeMd: !(result.claudeMd?.becameEmpty ?? false),
    skills: Object.fromEntries(
      result.skills.map((s) => [s.id, !s.becameEmpty]),
    ),
    routines: Object.fromEntries(result.routines.map((r) => [r.id, true])),
    learnings: Object.fromEntries(
      result.learnings.map((l) => [l.id, !l.becameEmpty]),
    ),
  };
}

/**
 * The override payload for the redactions the user chose to keep. Undefined
 * when there's nothing to override (no anonymize, or every change dropped).
 */
export function buildAnonymizeOverrides(
  wantAnonymize: boolean,
  anonymized: PortableAnonymizeResponse | null,
  accept: AnonymizeAccept,
): PortableExportOverrides | undefined {
  if (!wantAnonymize || !anonymized) return undefined;
  const ov: PortableExportOverrides = {};
  if (accept.claudeMd && anonymized.claudeMd) {
    ov.claudeMd = anonymized.claudeMd.after;
  }
  const skillBodies: Record<string, string> = {};
  for (const s of anonymized.skills) {
    if (accept.skills[s.id]) skillBodies[s.id] = s.after;
  }
  if (Object.keys(skillBodies).length) ov.skillBodies = skillBodies;
  const routineFields: PortableExportOverrides["routineFields"] = {};
  for (const r of anonymized.routines) {
    if (accept.routines[r.id]) routineFields[r.id] = r.overridePayload;
  }
  if (Object.keys(routineFields).length) ov.routineFields = routineFields;
  const learningTexts: Record<string, string> = {};
  for (const l of anonymized.learnings) {
    if (accept.learnings[l.id]) learningTexts[l.id] = l.after;
  }
  if (Object.keys(learningTexts).length) ov.learningTexts = learningTexts;
  return ov;
}

/**
 * Learnings the anonymize pass emptied AND the user didn't keep — they carry
 * no content, so they're dropped from the selection entirely.
 */
export function droppedLearningIds(
  wantAnonymize: boolean,
  anonymized: PortableAnonymizeResponse | null,
  accept: AnonymizeAccept,
): Set<string> {
  const drop = new Set<string>();
  if (wantAnonymize && anonymized) {
    for (const l of anonymized.learnings) {
      if (l.becameEmpty && !accept.learnings[l.id]) drop.add(l.id);
    }
  }
  return drop;
}

/** Turn the toggle-Set selection into the wire selection, minus dropped learnings. */
export function toExportSelection(
  sel: WizardSelection,
  dropped: Set<string>,
): PortableExportSelection {
  return {
    includeClaudeMd: sel.claudeMd,
    includeSkillSlugs: Array.from(sel.skillSlugs),
    includeRoutineIds: Array.from(sel.routineIds),
    includeLearningIds: Array.from(sel.learningIds).filter(
      (id) => !dropped.has(id),
    ),
  };
}

/** Trim, drop blanks, de-dupe (case-insensitive), and cap at MAX_TAGS. */
export function normalizeTags(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const tag of raw) {
    const value = tag.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/** The publish step's required fields are filled and the category is real. */
export function isListingComplete(form: ListingForm): boolean {
  return (
    form.description.trim().length > 0 &&
    isStoreCategory(form.category) &&
    form.creatorName.trim().length > 0
  );
}

/** Assemble the wire publish request from the listing form + gathered content. */
export function buildStorePublishRequest(args: {
  name: string;
  form: ListingForm;
  selection: PortableExportSelection;
  overrides?: PortableExportOverrides;
  anonymized: boolean;
}): StorePublishRequest {
  const { name, form, selection, overrides, anonymized } = args;
  const tagline = form.tagline.trim();
  const url = form.creatorUrl.trim();
  return {
    selection,
    overrides,
    identity: {
      name: name.trim(),
      description: form.description.trim(),
      ...(tagline ? { tagline } : {}),
      category: form.category,
      tags: normalizeTags(form.tags),
    },
    creator: {
      displayName: form.creatorName.trim(),
      ...(url ? { url } : {}),
    },
    anonymized,
  };
}
