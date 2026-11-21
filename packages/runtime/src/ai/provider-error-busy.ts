const UPSTREAM_PROVIDER_ERROR = /provider.?returned.?(?:an.?)?error/;
const SERVICE_UNAVAILABLE = /service.?(?:is.?)?(?:temporarily.?)?unavailable/;
const UPSTREAM_STREAM_BREAK =
  /upstream_request_failed|upstream_stream_read_error|stream was interrupted|http\/?2 stream failed|stream disconnected before completion/;
const NODE_FETCH_FAILURE = /request to \S+ failed, reason:\s*$/;

export function isRetriedServerFailure(
  lower: string,
  status: number | null,
): boolean {
  return (
    lower.includes("server_busy") ||
    lower.includes("servers are currently busy") ||
    lower.includes("provider stopped with: error (server error)") ||
    lower.includes("response headers timed out") ||
    (status === null &&
      (UPSTREAM_PROVIDER_ERROR.test(lower) ||
        SERVICE_UNAVAILABLE.test(lower) ||
        UPSTREAM_STREAM_BREAK.test(lower) ||
        NODE_FETCH_FAILURE.test(lower) ||
        lower.includes("unable to forward upstream")))
  );
}
