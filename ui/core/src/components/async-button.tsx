import * as React from "react";

import { Button } from "./button";
import { Spinner } from "./spinner";

type BaseButtonProps = React.ComponentProps<typeof Button>;

export interface AsyncButtonProps extends Omit<BaseButtonProps, "onClick"> {
  /**
   * Click handler that may kick off async work. While the returned promise is
   * in flight the button disables itself, so rapid ("rage") clicks can't fire
   * the action more than once (HOU-465). Return the promise — don't `void` it —
   * or the button can't tell when the work settles.
   */
  onClick?: (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => void | Promise<unknown>;
  /**
   * Render a leading spinner while the action is pending. Defaults to `true`.
   * Set `false` when the button already shows its own pending affordance.
   */
  spinner?: boolean;
}

function isThenable(value: unknown): value is Promise<unknown> {
  return (
    value != null && typeof (value as { then?: unknown }).then === "function"
  );
}

function AsyncButton({
  onClick,
  spinner = true,
  disabled,
  children,
  ...props
}: AsyncButtonProps) {
  const [pending, setPending] = React.useState(false);
  // A ref flips the instant the handler runs — before React commits the
  // re-render that applies `disabled` — so the burst of clicks that land in the
  // same frame are dropped. That same-frame burst is exactly what a rage click
  // is; relying on the `disabled` state alone leaves a one-frame window open.
  const inFlight = React.useRef(false);
  const mounted = React.useRef(true);
  React.useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const handleClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (inFlight.current) return;
      const result = onClick?.(event);
      if (!isThenable(result)) return;
      inFlight.current = true;
      setPending(true);
      // `finally` resets the guard without swallowing a rejection: a failing
      // handler still rejects up the chain (surfaced as an unhandled rejection
      // / captured by Sentry) rather than being silently dropped.
      void result.finally(() => {
        inFlight.current = false;
        if (mounted.current) setPending(false);
      });
    },
    [onClick],
  );

  return (
    <Button {...props} disabled={disabled || pending} onClick={handleClick}>
      {spinner && pending ? <Spinner /> : null}
      {children}
    </Button>
  );
}

export { AsyncButton };
