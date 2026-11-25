import { isTransportFailure } from "@houston/sdk/transport-failure";

// WHY: Gates bug reports, so it must never match a coding-bug TypeError; unwrap one cause only. ADR-0030
export function isNetworkTransportError(err: unknown): boolean {
  return (
    isTransportTypeError(err) ||
    (err instanceof Error && isTransportTypeError(err.cause))
  );
}

function isTransportTypeError(err: unknown): boolean {
  return isTransportFailure(err);
}
