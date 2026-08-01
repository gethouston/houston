import type { Specimen } from "../../../src/specimen";
import { specimen as bulkActionBar } from "./bulk-action-bar";
import { specimen as conversationList } from "./conversation-list";
import { specimen as kanbanBoard } from "./kanban-board";
import { specimen as kanbanCard } from "./kanban-card";
import { specimen as kanbanColumn } from "./kanban-column";
import { specimen as kanbanDetailPanel } from "./kanban-detail-panel";
import { specimen as kanbanList } from "./kanban-list";
import { specimen as kanbanPeople } from "./kanban-people";

/**
 * The **Activity** area: an agent's default tab — the mission board, its
 * columns, cards, bulk selection and the panel a mission opens into.
 *
 * One file per component in this folder (`<component>.tsx`, exporting
 * `export const specimen: Specimen` with `group: "Activity"` alongside
 * `export const sources: string[]`), listed below outside-in: the whole board,
 * then a column, then a card, then the pieces a card is made of, then the
 * surfaces beside it — the order a reviewer zooms in through.
 *
 * `sample.tsx` is the one fixture every page reads from, so the same missions
 * appear throughout and a difference on screen is a difference in the
 * component, never in the copy. `AIBoard` — the assembled screen these compose
 * into — is deliberately absent: it owns a chat panel, a composer and a live
 * message queue, and a page that stubbed those would document the stub.
 */
export const specimens: readonly Specimen[] = [
  kanbanBoard,
  kanbanColumn,
  kanbanCard,
  kanbanPeople,
  bulkActionBar,
  kanbanDetailPanel,
  kanbanList,
  conversationList,
];
