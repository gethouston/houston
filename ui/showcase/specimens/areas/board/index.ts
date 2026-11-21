import type { Specimen } from "../../../src/specimen";
import { specimen as bulkActionBar } from "./bulk-action-bar";
import { specimen as conversationList } from "./conversation-list";
import { specimen as kanbanBoard } from "./kanban-board";
import { specimen as kanbanCard } from "./kanban-card";
import { specimen as kanbanColumn } from "./kanban-column";
import { specimen as kanbanDetailPanel } from "./kanban-detail-panel";
import { specimen as kanbanList } from "./kanban-list";
import { specimen as kanbanPeople } from "./kanban-people";

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
