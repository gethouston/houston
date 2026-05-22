# @houston-ai/layout

App-level layout primitives. Sidebar for navigation, tab bar for view switching, split view for panels.

## Install

```bash
bun add @houston-ai/layout
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
- `TabBar` -- horizontal tab strip with badges and action slots
- `SplitView` -- two-pane layout with resizable divider
- `ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle` -- lower-level resizable primitives

## Peer Dependencies

- React 19+
- @houston-ai/core

---

Part of [Houston](../../README.md).
