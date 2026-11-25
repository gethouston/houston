// WHY: Exact (status, reason) pairs only; a provider quota page can also be a bare 502 or 503. ADR-0019
export function isWakingAnswer(status: number, reason: string): boolean {
  if (status === 503) {
    return (
      reason === "engine unavailable" ||
      reason === "the agent's runtime is still starting, try again shortly" ||
      reason === "the host is shutting down; retry shortly"
    );
  }
  return status === 502 && reason === "engine proxy failed";
}
