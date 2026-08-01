import type { Specimen } from "../../../src/specimen";
import { specimen as designSheet } from "./design-sheet";
import { specimen as storePage } from "./store-page";

/**
 * The **Agent Store** area: the store's design language and the page frame
 * every store screen composes from (`@houston-ai/store`) — which will be
 * consumed by both the in-app store view and the store website as the redesign
 * lands. Today the showcase is its only consumer, so these pages are where the
 * language is agreed BEFORE either surface adopts it.
 *
 * Listed in nav order — the language sheet first, because it is the page a
 * reviewer reads before judging anything built on it.
 */
export const specimens: readonly Specimen[] = [designSheet, storePage];
