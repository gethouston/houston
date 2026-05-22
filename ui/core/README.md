# @houston-ai/core

Foundation layer for Houston UI. 37 shadcn/ui components, design tokens, CSS animations, and utilities.

## Install

```bash
bun add @houston-ai/core
```

## Usage

```tsx
import { Button, Badge, Card, Tooltip } from "@houston-ai/core"
import "@houston-ai/core/src/globals.css"

<Button variant="default">Run Agent</Button>
<Badge>3 tasks</Badge>
```

## What's included

**Components:** Accordion, AgentAvatar, Alert, AlertDialog, Avatar, Badge, Button, ButtonGroup, Card, Carousel, Collapsible, Command, ConfirmDialog, Dialog, DropdownMenu, Empty, ErrorBoundary, HoverCard, Input, InputGroup, Kbd, Popover, Progress, Resizable, ScrollArea, Select, Separator, Sheet, Sidebar, Skeleton, Sonner, Spinner, Switch, Tabs, Textarea, ToastContainer, Tooltip

**Utilities:** `cn()` (clsx + tailwind-merge), `useMobile()` hook

**Styles:** `globals.css` with design tokens, running card glow animation, typing dots, tool pulse, custom scrollbars

## Theming

Override CSS variables in `globals.css` to customize the entire design system. See the [main README](../../README.md#theming) for details.

## Peer Dependencies

- React 19+
- Tailwind CSS 4+

---

Part of [Houston](../../README.md).
