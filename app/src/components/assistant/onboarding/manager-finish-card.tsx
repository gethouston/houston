import { Button, Spinner } from "@houston-ai/core";
import { CARD_PRIMARY_ACTION_CLASS, CardActions } from "./card-actions";

export function ManagerFinishCard({
  action,
  saving = false,
  onDone,
}: {
  action: string;
  saving?: boolean;
  onDone: () => void;
}) {
  return (
    <div data-testid="manager-finish" className="flex w-full md:justify-end">
      <CardActions>
        <Button
          type="button"
          className={CARD_PRIMARY_ACTION_CLASS}
          disabled={saving}
          aria-busy={saving || undefined}
          onClick={() => onDone()}
        >
          {saving ? <Spinner className="size-4" /> : null}
          {action}
        </Button>
      </CardActions>
    </div>
  );
}
