# @houston-ai/layout

App-level layout primitives: a sidebar for navigation, a workspace switcher, a split view for panels, and a tab bar. The Houston app mounts the sidebar family and the workspace switcher. `TabBar` and `SplitView` are library primitives exercised by their showcase specimens (`ui/showcase/specimens/areas/agents/`).

## Install

```bash
pnpm add @houston-ai/layout
```

## Usage

```tsx
import { AppSidebar, TabBar, SplitView } from "@houston-ai/layout"
import "@houston-ai/layout/src/styles.css"

<AppSidebar
  logo={<Logo />}
  items={projects}
  selectedId={activeId}
  onSelect={setActiveId}
  onAdd={createProject}
  labels={{ addItem: "Add project" }}
/>

<TabBar
  tabs={[
    { id: "board", label: "Board" },
    { id: "chat", label: "Chat", badge: 2 },
  ]}
  activeTab={currentTab}
  onTabChange={setCurrentTab}
/>
```

### The grouped rail

Pass `groups` (even `[]`) and `order` to render the mixed drag-and-drop layout. `order` interleaves root items and groups; new root items lead and groups missing from `order` trail. Root items align with group headers. Only items inside a group use the child indent. Each group has one header row followed by its items, sharing the geometry in `src/sidebar-geometry.ts`.

That ladder is not only the group blocks. **Every interactive line in the rail is one `SidebarRowButton`** -- the top-level nav destinations, the band that names the list, each group header, each agent, and the "New agent" row that closes it. The only two forks are the icon-only collapsed rail (a different anatomy, not a narrower row) and inline rename (the consumer swaps the row for a field). `tests/sidebar-row-anatomy.test.ts` asserts that every one of those modules goes through the component and that none of them restates its geometry.

```tsx
<AppSidebar
  items={agents}
  selectedId={openAgentId}
  onSelect={openAgent}
  // The band that names the list. Its LABEL is the collapse toggle; the
  // action opens the creation menu.
  sectionLabel="Your AI Employees"
  sectionAction={<TeamsBandMenu />}
  sectionCollapsed={bandCollapsed}
  onToggleSectionCollapsed={toggleBand}
  order={layout.order}
  groups={layout.groups.map((group) => ({
    id: group.id,
    name: group.name,
    itemIds: group.agentIds,
    collapsed: group.collapsed,
    icon: <GroupGlyph group={group} />,
    // Only while FOLDED: the rows that carried these signals are not drawn.
    trailing: group.collapsed ? <NeedsYou count={group.waiting} /> : undefined,
  }))}
  // Header activation folds or unfolds the group; the host writes the new
  // `collapsed` back.
  onActivateGroup={toggleGroupFold}
  // A drop hands over the whole arrangement the rail now shows.
  onArrange={saveArrangement}
  // In grouped mode this renders as the row that CLOSES the list, not as an
  // icon button: creating an agent is the rail's primary action.
  onAdd={createAgent}
  labels={{ addItem: "New agent" }}
/>
```

Each folder's collapsed flag is controlled and persisted by the host. Root items follow `order` between folders. Dragging is a sortable tree over one flat row list (`sidebar-tree.ts`): the dragged row stays in the list as a faded ghost at the slot and depth it will land in, and the drop reports that exact arrangement through `onArrange` (the top-level order plus every folder's members), which answers whether it was stored: a refused drop is not drawn, and without `onArrange` nothing can be dragged or moved. Depth follows the neighbours: above a folder member the ghost is inside the folder, under an open folder header or its last member it stays at its current depth until dragged sideways (20px per level), under a collapsed folder header it is top level unless dragged right (it then joins the end of that folder), and anywhere else it is top level. A folder moves as one block among top-level rows and never nests. Its own members hide during the drag; other folders keep their visible rows. Enter and Space activate a focused row. Alt+Up and Alt+Down move it one slot; Alt+Right and Alt+Left move an agent into or out of a folder when its neighbours allow it. The host supplies drag announcements through `labels`.

## Exports

- `AppSidebar` -- the navigation rail: agent list (flat or grouped into folders), nav items, header/footer slots, add, rename, delete, keyboard shortcuts, and optional labels for app-level i18n
- `SidebarRowButton` -- **THE rail row.** A fixed 28px box, a 20px glyph column (a 16px Lucide mark or a 14px group mark), a truncating label, a `trailing` slot inside the button and an `affordance` slot beside it; `depth` picks the indent (`block` heads a block, `child` hangs under one), `active` paints the inset pill (drawn on a layer behind the content, so it can be inset without moving the glyph column) and sets `aria-current`, `band` drops it to the 12px type step for the row that names the list, `disclosure` turns it into a real `<button aria-expanded aria-controls>` with a small filled triangle after the label that rotates a quarter turn when it opens. Everything else in this list is a preset of it
- Person rows -- every AI Employee row renders `SidebarRowButton` with `anatomy="person"`: a 44px row around a 32px portrait, the name over its `subtitle` (the item's role; an item with no `subtitle` keeps the height and centres its name). `sidebarPersonRow` holds that geometry
- `sidebarCollapsedItem` -- an AI Employee on the collapsed icon rail: a 36px square around a 24px avatar, so the avatar and its running ring (`sidebarRingClearance`) fit inside it, with the needs-you chip on the avatar's shoulder. The rail supplies the diameter through `SidebarAvatarDiameter`; a host's avatar reads it with `useSidebarAvatarDiameter()`, so one icon node serves both rails
- `sidebarRowAffordanceClasses` -- the class string a row's trailing control wears (`...`, `+`), exported so a host mounting its own menu into `sectionAction` cannot drift from the ones the library draws
- `SidebarSectionHeader` -- the band that names the list ("Your AI Employees"). Its label is itself the collapse toggle, with the disclosure triangle right after the words and one trailing `action` slot opposite; with no `onToggleCollapsed` it degrades to a plain label
- `SidebarAddRow` -- the single "New agent" row after the mixed root list, wearing the top-level row geometry
- `SidebarGroupHeader` -- a block's header: ONE `<button aria-expanded>` carrying the glyph, the name, the disclosure triangle and an optional `trailing` rollup badge. The triangle is an INDICATOR: the whole row is the fold toggle, and `onActivate` reports the click so the host writes the new `collapsed` back
- `SidebarGroupedList`, `SidebarFlatList`, `SidebarNavItem` -- the pieces `AppSidebar` composes, exported for hosts that assemble their own rail
- `flattenSidebar`, `projectSidebarDrop`, `arrangementFromRows` -- the pure drag model: rows, where a drop lands, and the arrangement it stores
- `computeSidebarSections` -- walks the mixed root order, fills in new items and missing groups, and renders only actual root entries
- `WorkspaceSwitcher` -- the rail's top slot
- `TabBar` -- horizontal tab strip with badges and action slots. Its consumer is the showcase specimen (`ui/showcase/specimens/areas/agents/tab-bar.tsx`)
- `SplitView` -- two-pane layout with resizable divider
- `ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle` -- lower-level resizable primitives

## Peer Dependencies

- React 19+
- @houston-ai/core

---

Part of [Houston](../../README.md).
