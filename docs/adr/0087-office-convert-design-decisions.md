# Office convert: design decisions

Covers `packages/office-convert/`: the Office to PDF conversion service and its tests.

## Process exit precedes descendant cleanup

A parent's `exit` event can fire before its descendants leave the process table, so tests that assert on descendant cleanup must poll rather than check once at exit.

Lives in `packages/office-convert/src/server.test.ts`.

## Internal compose networks

Internal-only compose networks accept requests through `docker exec`, which is how the container test reaches the service.

Lives in `packages/office-convert/src/docker.test.ts`.
