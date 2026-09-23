import {
  Button,
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@houston-ai/core";

/**
 * The close X in a header row of the recipe's own, the way the wide FlowSheet
 * and the AI Hub detail carry it: `DialogCloseButton` is the corner X moved
 * into the row, so a recipe with a header never hand-rolls a second X.
 */
export function HeaderCloseDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Browse Inbox Zero's models</Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="gap-0 p-0">
        <div className="flex items-start gap-2 px-5 pt-5 pb-4">
          <div className="min-w-0 flex-1">
            <DialogTitle>Inbox Zero</DialogTitle>
            <DialogDescription>Reads Gmail, writes drafts.</DialogDescription>
          </div>
          <DialogCloseButton label="Close" className="-mr-1.5" />
        </div>
        <p className="px-5 pb-5 text-sm text-ink-muted">
          The body scrolls; the header row stays.
        </p>
      </DialogContent>
    </Dialog>
  );
}
