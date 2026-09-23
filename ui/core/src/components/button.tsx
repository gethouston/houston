import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "../utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-focus focus-visible:ring-[3px] focus-visible:ring-focus/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-danger aria-invalid:ring-danger-ring [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-action text-action-text hover:bg-action/70",
        destructive:
          "bg-danger-fill text-white hover:bg-danger/70 focus-visible:ring-danger-ring",
        outline:
          "border bg-field shadow-xs hover:bg-field-hover hover:text-hover-text dark:border-line-input",
        secondary: "bg-chip text-chip-text hover:bg-chip-text/15",
        ghost: "hover:bg-hover hover:text-hover-text dark:hover:bg-hover/50",
        link: "text-action underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  type,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";
  // HTML defaults a typeless <button> to SUBMIT, so a plain Button among a
  // form's fields was silently a second submit control — the copy-agent
  // dialog's team rows saved the form with the PREVIOUSLY selected team
  // (PRODUCT-1523). The default is inert; the one control that means to submit
  // says `type="submit"`. `asChild` keeps whatever the caller passed and
  // nothing more: it styles someone else's element (an anchor, a Radix
  // trigger), where `type` is usually not a valid attribute at all.
  const resolvedType = asChild ? type : (type ?? "button");

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      type={resolvedType}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
