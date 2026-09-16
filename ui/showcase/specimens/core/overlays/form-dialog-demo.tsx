import { Button, FormDialog, Input } from "@houston-ai/core";
import { type ReactNode, useState } from "react";

/**
 * The trigger + instance pair every `FormDialog` row on the specimen page is
 * built from. Split out only to keep that page inside the 200-line rule.
 *
 * Like `ConfirmDialog`, `FormDialog` is controlled-only — it has no trigger of
 * its own. Every row therefore pairs one button with one instance, which is
 * exactly how the app uses it.
 */
export function Form({
  label,
  buttonVariant = "outline",
  children,
  ...props
}: {
  label: string;
  buttonVariant?: "default" | "outline";
  children?: ReactNode;
} & Omit<
  Parameters<typeof FormDialog>[0],
  "open" | "onOpenChange" | "children"
>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={buttonVariant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <FormDialog {...props} open={open} onOpenChange={setOpen}>
        {children ?? (
          <Input defaultValue="Inbox Zero" aria-label="Agent name" />
        )}
      </FormDialog>
    </>
  );
}

/** Work that takes long enough to watch the pending state. */
export const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
