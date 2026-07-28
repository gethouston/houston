// `MessageMention` rides along because AIBoard's own send/create signatures
// take it: a consumer typing `onCreateConversation` has to name the type, and
// reaching past the board into `@houston-ai/chat` for it would be the board
// leaking its dependency.
export type { MessageMention } from "@houston-ai/chat";
export type { AIBoardProps, NewPanelOpener, NewPanelOptions } from "./ai-board";
export { AIBoard } from "./ai-board";
export type {
  BulkActionBarLabels,
  BulkActionBarProps,
  BulkMoveTarget,
} from "./bulk-action-bar";
export { BulkActionBar } from "./bulk-action-bar";
export type { ConversationListProps } from "./conversation-list";
export { ConversationList } from "./conversation-list";
export type { ColumnDragRole } from "./dnd";
export { columnDragRole, defaultCanDropItem } from "./dnd";
export type { KanbanBoardProps } from "./kanban-board";
export { KanbanBoard } from "./kanban-board";
export type { KanbanCardLabels, KanbanCardProps } from "./kanban-card";
export { KanbanCard } from "./kanban-card";
export type { KanbanColumnProps } from "./kanban-column";
export { KanbanColumn } from "./kanban-column";
export type { KanbanDetailPanelProps } from "./kanban-detail-panel";
export { KanbanDetailPanel } from "./kanban-detail-panel";
export type { KanbanListProps } from "./kanban-list";
export { KanbanList } from "./kanban-list";
export type { KanbanListItemProps } from "./kanban-list-item";
export { KanbanListItem } from "./kanban-list-item";
export { KANBAN_LIST_RAIL_CLASS_NAME } from "./kanban-list-layout";
export type { KanbanListRailProps } from "./kanban-list-rail";
export { KanbanListRail } from "./kanban-list-rail";
export type {
  KanbanPeopleProps,
  KanbanPeopleSurface,
} from "./kanban-people";
export {
  CARD_PEOPLE_MAX,
  initialsFor,
  KanbanPeople,
  overflowCount,
  visiblePeople,
} from "./kanban-people";
export type {
  PersonNameToneClass,
  PersonToneClass,
} from "./kanban-people-tone";
export { personNameToneClass, personToneClass } from "./kanban-people-tone";
export type {
  BoardSearchSnippet,
  ConversationEntry,
  KanbanColumn as KanbanColumnConfig,
  KanbanItem,
  KanbanPerson,
} from "./types";
