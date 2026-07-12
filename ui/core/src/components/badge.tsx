import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "../utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-focus focus-visible:ring-[3px] focus-visible:ring-focus/50 aria-invalid:border-danger aria-invalid:ring-danger/20 dark:aria-invalid:ring-danger/40 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-action text-action-text [a&]:hover:bg-action/90",
        secondary: "bg-chip text-chip-text [a&]:hover:bg-chip/90",
        destructive:
          "bg-danger text-white focus-visible:ring-danger/20 dark:bg-danger/60 dark:focus-visible:ring-danger/40 [a&]:hover:bg-danger/90",
        outline:
          "border-line text-ink [a&]:hover:bg-hover [a&]:hover:text-hover-text",
        ghost: "[a&]:hover:bg-hover [a&]:hover:text-hover-text",
        link: "text-action underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
