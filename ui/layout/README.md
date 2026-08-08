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
  labels={{
    addItem: "Add project",
    moreOptions: "Project options",
    renameItem: "Rename",
    deleteItem: "Delete",
  }}
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

## Exports

- `AppSidebar` -- project/chat list sidebar with logo, add, delete, keyboard shortcuts, and optional labels for app-level i18n
- `TabBar` -- horizontal tab strip with badges and action slots. **The Houston app mounts none:** it was the per-agent tab strip, and that shell was deleted (every screen is a top-level view now). It stays here as a library primitive, and its only live consumer is the showcase specimen (`ui/showcase/specimens/areas/agents/tab-bar.tsx`) -- so treat the usage example below as the component's contract, not as a description of the app
- `SplitView` -- two-pane layout with resizable divider
- `ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle` -- lower-level resizable primitives

## Peer Dependencies

- React 19+
- @houston-ai/core

---

Part of [Houston](../../README.md).
