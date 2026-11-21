"use client";

import * as React from "react";

import { Button } from "./button";
import { Spinner } from "./spinner";

type BaseButtonProps = React.ComponentProps<typeof Button>;

export interface AsyncButtonProps extends Omit<BaseButtonProps, "onClick"> {
  onClick?: (
    event: React.MouseEvent<HTMLButtonElement>,
    // biome-ignore lint/suspicious/noConfusingVoidType: sync handlers return void, async ones return a Promise
  ) => void | Promise<unknown>;
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
