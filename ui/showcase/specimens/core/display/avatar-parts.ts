import type { SpecimenProp } from "../../../src/specimen";

/** The public API of the six `avatar.tsx` exports, read off their TS types. */
export const AVATAR_PROPS: readonly SpecimenProp[] = [
  {
    name: "Avatar size",
    type: '"sm" | "default" | "lg"',
    note: 'Defaults to "default" (32px); sm 24px, lg 40px. Set on `data-size`, which the child slots read.',
  },
  {
    name: "Avatar ...props",
    type: "React.ComponentProps<typeof AvatarPrimitive.Root>",
    note: "Radix Avatar root — `asChild`, `onLoadingStatusChange`, DOM attributes.",
  },
  {
    name: "AvatarImage ...props",
    type: "React.ComponentProps<typeof AvatarPrimitive.Image>",
    note: "`src`, `alt`, `referrerPolicy`; hidden until the image actually loads.",
  },
  {
    name: "AvatarFallback ...props",
    type: "React.ComponentProps<typeof AvatarPrimitive.Fallback>",
    note: "`delayMs` to hold the fallback back; children are usually initials.",
  },
  {
    name: "AvatarBadge ...props",
    type: 'React.ComponentProps<"span">',
    note: "Corner dot inside an Avatar. Sizes itself from the parent's `data-size`; its `<svg>` child is hidden at `sm`.",
  },
  {
    name: "AvatarGroup ...props",
    type: 'React.ComponentProps<"div">',
    note: "Overlaps its Avatar children by 8px and rings each one in the input colour.",
  },
  {
    name: "AvatarGroupCount ...props",
    type: 'React.ComponentProps<"div">',
    note: 'The trailing "+N" disc. Tracks the group\'s avatar size via `group-has-data-[size=*]`.',
  },
  {
    name: "className",
    type: "string",
    note: "Merged last on every one of the six parts.",
  },
];

/** The token utilities the six parts paint with. */
export const AVATAR_TOKENS: readonly string[] = [
  "bg-chip-subtle",
  "text-ink-muted",
  "bg-action",
  "text-action-text",
  "ring-input",
];
