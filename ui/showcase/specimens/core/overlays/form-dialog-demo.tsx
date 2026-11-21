import { Button, FormDialog, Input } from "@houston-ai/core";
import { type ReactNode, useState } from "react";

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

export const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
