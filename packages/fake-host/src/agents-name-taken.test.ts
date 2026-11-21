import { afterEach, beforeEach, expect, it } from "vitest";
import { type FakeHost, startFakeHost } from "./server";

const JSON_HEADERS = { "content-type": "application/json" };
let host: FakeHost;

beforeEach(async () => {
  host = await startFakeHost(0);
});
afterEach(async () => {
  await host.stop();
});

const send = (method: string, path: string, body: unknown) =>
  fetch(`${host.url}${path}`, {
    method,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });

it("refuses a create or rename onto another agent's name, in any case", async () => {
  const mia = (await (
    await send("POST", "/agents", { name: "Mia" })
  ).json()) as {
    id: string;
  };
  const leo = (await (
    await send("POST", "/agents", { name: "Leo" })
  ).json()) as {
    id: string;
  };

  const create = await send("POST", "/agents", { name: " mia " });
  expect(create.status).toBe(409);
  expect(await create.json()).toMatchObject({ code: "name_taken" });

  const rename = await send("PATCH", `/agents/${leo.id}`, { name: "MIA" });
  expect(rename.status).toBe(409);
  expect(await rename.json()).toMatchObject({ code: "name_taken" });

  const ownSpelling = await send("PATCH", `/agents/${mia.id}`, { name: "MIA" });
  expect(ownSpelling.status).toBe(200);
});

it("stores a created or renamed name trimmed, like the real host", async () => {
  const created = await send("POST", "/agents", { name: "  Orion  " });
  const orion = (await created.json()) as { id: string; name: string };
  expect(orion.name).toBe("Orion");

  const renamed = await send("PATCH", `/agents/${orion.id}`, {
    name: " Vega ",
  });
  expect(await renamed.json()).toMatchObject({ name: "Vega" });
});

it("answers 404 for an unknown agent before checking the name", async () => {
  await send("POST", "/agents", { name: "Mia" });

  const rename = await send("PATCH", "/agents/agent-missing", { name: "Mia" });
  expect(rename.status).toBe(404);
});

it("refuses the AI Manager's name for a new or renamed agent, like the desktop host", async () => {
  const create = await send("POST", "/agents", { name: " houston " });
  expect(create.status).toBe(400);
  expect(await create.json()).toMatchObject({ code: "name_reserved" });

  const created = await send("POST", "/agents", { name: "Zoe" });
  expect(created.status).toBe(200);
  const zoe = (await created.json()) as { id: string };
  const rename = await send("PATCH", `/agents/${zoe.id}`, { name: "HOUSTON" });
  expect(rename.status).toBe(400);
  expect(await rename.json()).toMatchObject({ code: "name_reserved" });

  expect(
    (await send("POST", "/agents", { name: "Houston Sales" })).status,
  ).toBe(200);
});

it("keeps a Houston employee the desktop-to-cloud move brings, and lets it re-save its name", async () => {
  const moved = await send("POST", "/agents", {
    name: "Houston",
    migration: true,
  });
  expect(moved.status).toBe(200);
  const { id } = (await moved.json()) as { id: string };

  const resave = await send("PATCH", `/agents/${id}`, { name: "houston" });
  expect(resave.status).toBe(200);
  expect(await resave.json()).toMatchObject({ name: "houston" });
});
