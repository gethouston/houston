# @houston-ai/layout

App-level layout primitives: a sidebar for navigation, a workspace switcher, a split view for panels, and a tab bar. The Houston app mounts the sidebar family and the workspace switcher. **`TabBar` and `SplitView` have no product consumer today** — the tab bar was the per-agent tab strip and that shell is gone; both stay as library primitives, exercised only by their showcase specimens (`ui/showcase/specimens/areas/agents/`).

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

Pass `groups` (even `[]`) and the flat list becomes the grouped drag-and-drop layout. Give a group an `icon`, name the trailing block with `defaultGroup`, and each block becomes a team: one header row, then its agents -- all on a single row ladder (one fixed height, one glyph column, one type size), defined once in `src/sidebar-classes.ts`.

That ladder is not only the team blocks. **Every interactive line in the rail is one `SidebarRowButton`** -- the top-level nav destinations, the band that names the list, each team header, each agent, and the "New agent" row that closes it. The only two forks are the icon-only collapsed rail (a different anatomy, not a narrower row) and inline rename (the consumer swaps the row for a field). `tests/sidebar-row-anatomy.test.ts` asserts that every one of those modules goes through the component and that none of them restates its geometry.

```tsx
<AppSidebar
  items={agents}
  selectedId={openAgentId}
  onSelect={openAgent}
  // The band that names the list. Its LABEL is the collapse toggle; the
  // action is the host's one create/join menu.
  sectionLabel="Your teams"
  sectionAction={<TeamsBandMenu />}
  sectionCollapsed={bandCollapsed}
  onToggleSectionCollapsed={toggleBand}
  groups={teams.map((team) => ({
    id: team.id,
    name: team.name,
    itemIds: team.agentIds,
    collapsed: team.collapsed,
    icon: <Users className="size-4" />,       // monochrome by design
    // A block carries no destination rows, so its HEADER is the only row that
    // can say the open view belongs here -- folded or open alike.
    active: team.id === openTeamId,
    // Only while FOLDED: the rows that carried these signals are not drawn.
    trailing: team.collapsed ? <NeedsYou count={team.waiting} /> : undefined,
  }))}
  // The header was activated. YOU decide what that means -- open the team's
  // screen, fold the block, or both.
  onActivateGroup={openOrFoldTeam}
  defaultGroup={{
    name: workspaceName,
    icon: <Users className="size-4" />,
    collapsed: layout.defaultCollapsed,
    active: openTeamId === null,
  }}
  onActivateDefault={openOrFoldDefaultTeam}
  // In grouped mode this renders as the row that CLOSES the list, not as an
  // icon button: creating an agent is the rail's primary action.
  onAdd={createAgent}
  labels={{ addItem: "New agent" }}
/>
```

Both collapse flags are **controlled and host-persisted** -- a rail that forgets what it folded on every reload is worse than one that never folded. The default block has no stored group record, which is why it folds through its own `collapsed` / `onActivateDefault` pair rather than through `groups`.

## Exports

- `AppSidebar` -- the navigation rail: agent list (flat or grouped into teams), nav items, header/footer slots, add, rename, delete, keyboard shortcuts, and optional labels for app-level i18n
- `SidebarRowButton` -- **THE rail row.** A fixed 28px box, a 20px glyph column, a truncating label, a `trailing` slot inside the button and an `affordance` slot beside it; `depth` picks the indent (`block` heads a block, `child` hangs under one), `active` paints the inset pill (drawn on a layer behind the content, so it can be inset without moving the glyph column) and sets `aria-current`, `band` drops it to the 12px type step for the row that names the list, `disclosure` turns it into a real `<button aria-expanded aria-controls>` with a small filled triangle after the label that rotates a quarter turn when it opens. Everything else in this list is a preset of it
- `sidebarRowAffordanceClasses` -- the class string a row's trailing control wears (`...`, `+`), exported so a host mounting its own menu into `sectionAction` cannot drift from the ones the library draws
- `SidebarSectionHeader` -- the band that names the list ("Your teams"). Its label is itself the collapse toggle, with the disclosure triangle right after the words and one trailing `action` slot opposite; with no `onToggleCollapsed` it degrades to a plain label
- `SidebarAddRow` -- the "New agent" row that closes the grouped list, wearing the child-row geometry so it lands in the same glyph column as everything above it
- `SidebarGroupHeader` -- a block's header: ONE `<button aria-expanded aria-controls>` carrying the glyph, the name, the disclosure triangle and an optional `trailing` rollup badge, with the `menu` render prop rendered as its sibling and inline rename through `rename`. The triangle is an INDICATOR: `onActivate` reports the click and the host decides what it means
- `SidebarGroupSection`, `SidebarGroupedList`, `SidebarFlatList`, `SidebarNavItem` -- the pieces `AppSidebar` composes, exported for hosts that assemble their own rail
- `computeSidebarSections` -- partitions items into ordered group sections plus the trailing default one
- `WorkspaceSwitcher` -- the rail's top slot
- `TabBar` -- horizontal tab strip with badges and action slots. **The Houston app mounts none:** it was the per-agent tab strip, and that shell was deleted (every screen is a top-level view now). It stays here as a library primitive, and its only live consumer is the showcase specimen (`ui/showcase/specimens/areas/agents/tab-bar.tsx`) -- so treat the usage example above as the component's contract, not as a description of the app
- `SplitView` -- two-pane layout with resizable divider
- `ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle` -- lower-level resizable primitives

## Peer Dependencies

- React 19+
- @houston-ai/core

---

Part of [Houston](../../README.md).
