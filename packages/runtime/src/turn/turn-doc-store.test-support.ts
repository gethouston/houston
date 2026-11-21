export type Row = { id: string; status: string; started_at: string } & Record<
  string,
  unknown
>;

export const row = (id: string, minute: number, status = "surfaced"): Row => ({
  id,
  routine_id: "r1",
  status,
  session_key: "routine-r1",
  started_at: `2026-09-30T10:${String(minute).padStart(2, "0")}:00.000Z`,
  ...(status === "running"
    ? {}
    : {
        completed_at: `2026-09-30T10:${String(minute).padStart(2, "0")}:30.000Z`,
      }),
});

export function docStore(
  initial: Row[] | undefined,
  opts: { bareConflict?: boolean } = {},
) {
  let doc = initial;
  let revision = initial ? 1 : 0;
  const puts: number[] = [];
  let beforePut: (() => void) | undefined;
  const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
    if (!init?.method || init.method === "GET") {
      return doc === undefined
        ? Response.json({ error: "document not found" }, { status: 404 })
        : Response.json({ doc, revision });
    }
    const expected = Number(new Headers(init.headers).get("If-Match"));
    puts.push(expected);
    const race = beforePut;
    beforePut = undefined;
    race?.();
    if (expected !== revision) {
      return Response.json(
        opts.bareConflict ? { revision } : { revision, doc },
        { status: 409 },
      );
    }
    doc = (JSON.parse(String(init.body)) as { doc: Row[] }).doc;
    revision += 1;
    return Response.json({ doc, revision });
  }) as typeof fetch;
  return {
    fetchImpl,
    puts,
    doc: () => doc ?? [],
    raceNextPut: (rows: Row[]) => {
      beforePut = () => {
        doc = rows;
        revision += 1;
      };
    },
  };
}
