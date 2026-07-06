/**
 * Turns the matched model set into the section layout the list renders. Idle →
 * Recent, Favorites, then one group per provider (in `providerOrder`), each
 * narrowed to the matched set. Otherwise → a single flat ranked section.
 */

import {
  filterMatched,
  isIdle,
  type ModelPickerFilterState,
  sortModels,
} from "./catalog";
import type { ModelPickerModel } from "./types";

export interface ModelPickerSectionVM {
  /** Stable key for React + cmdk group. */
  id: string;
  kind: "recent" | "favorites" | "provider" | "results";
  /** Present only for `kind === "provider"`. */
  providerId?: string;
  models: ModelPickerModel[];
}

export interface ModelPickerView {
  matchedCount: number;
  /** True when showing the grouped idle layout (Recent / Favorites / providers). */
  idle: boolean;
  sections: ModelPickerSectionVM[];
}

export function buildView(
  models: ModelPickerModel[],
  providerOrder: string[],
  providerNames: ReadonlyMap<string, string>,
  favorites: ReadonlySet<string>,
  recents: string[],
  state: ModelPickerFilterState,
): ModelPickerView {
  const matched = filterMatched(models, providerNames, favorites, state);
  const matchedCount = matched.length;

  if (isIdle(state)) {
    const byId = new Map(matched.map((m) => [m.id, m]));
    const sections: ModelPickerSectionVM[] = [];

    const recent = recents
      .map((id) => byId.get(id))
      .filter((m): m is ModelPickerModel => m !== undefined);
    if (recent.length)
      sections.push({ id: "recent", kind: "recent", models: recent });

    const favs = matched.filter((m) => favorites.has(m.id));
    if (favs.length)
      sections.push({ id: "favorites", kind: "favorites", models: favs });

    for (const providerId of providerOrder) {
      const group = matched.filter((m) => m.providerId === providerId);
      if (group.length) {
        sections.push({
          id: `provider:${providerId}`,
          kind: "provider",
          providerId,
          models: group,
        });
      }
    }
    return { matchedCount, idle: true, sections };
  }

  const sorted = sortModels(matched, state.sort, favorites);
  const kind =
    state.provider === "fav"
      ? "favorites"
      : state.provider !== "all"
        ? "provider"
        : "results";
  return {
    matchedCount,
    idle: false,
    sections: [
      {
        id: "flat",
        kind,
        providerId:
          state.provider !== "all" && state.provider !== "fav"
            ? state.provider
            : undefined,
        models: sorted,
      },
    ],
  };
}
