import { isTransportFailure } from "@houston/sdk/transport-failure";

export function isNetworkTransportError(err: unknown): boolean {
  return (
    isTransportTypeError(err) ||
    (err instanceof Error && isTransportTypeError(err.cause))
  );
}

function isTransportTypeError(err: unknown): boolean {
  return isTransportFailure(err);
}
