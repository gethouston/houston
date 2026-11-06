import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  fauxAssistantMessage,
  fauxProvider,
  type TranscriptContext,
} from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import { HoustonAuthStore } from "../auth/credential-store";
import { config } from "../config";
import { runTurn } from "./turn-session";

test.each([
  { role: null, timezone: "Asia/Tokyo" },
  { role: null, timezone: undefined },
  { role: "coordinator", timezone: "America/Bogota" },
  { role: "coordinator", timezone: undefined },
] as const)("a real pooled pi request names the right routine zone once for $role/$timezone", async ({
  role,
  timezone,
}) => {
  const turnRoot = mkdtempSync(join(tmpdir(), "pooled-pi-zone-"));
  const workspaceDir = join(turnRoot, "workspace");
  const dataDir = join(turnRoot, "data");
  mkdirSync(workspaceDir);
  mkdirSync(dataDir);
  const faux = fauxProvider();
  const modelRuntime = await ModelRuntime.create({
    credentials: new HoustonAuthStore(join(dataDir, "auth.json")),
    modelsPath: join(dataDir, "models.json"),
  });
  modelRuntime.registerNativeProvider(faux.provider);
  const prior = config.systemPrompt;
  try {
    for (const systemPrompt of ["", "Custom product prompt"]) {
      config.systemPrompt = systemPrompt;
      const requests: TranscriptContext[] = [];
      faux.setResponses([
        (context) => {
          requests.push(structuredClone(context));
          return fauxAssistantMessage("All set.");
        },
      ]);
      await runTurn(
        { turnRoot, workspaceDir, dataDir },
        {
          conversationId: systemPrompt ? "custom" : "product",
          text: "hello",
          provider: "faux",
          role: role ?? undefined,
          timezone,
          emit: () => undefined,
          signal: undefined,
          turnId: "t-zone",
        },
        {
          createModelRuntime: async () => ({
            modelRuntime,
            model: faux.getModel(),
          }),
        },
      );
      const message = requests[0]?.messages.find((m) => m.role === "system");
      const prompt = Object.values(message?.sections ?? {}).join("\n\n");
      const line =
        role === "coordinator"
          ? "Each AI employee's routines run in its own time zone, shown on the employee; write the cron in that zone's local time and never add a time zone to it."
          : "Routines run in Asia/Tokyo. Write the cron in that local time and never add a time zone to it.";
      expect(prompt.split(line).length - 1).toBe(role || timezone ? 1 : 0);
      if (role === "coordinator")
        expect(prompt).not.toContain("Routines run in America/Bogota");
      if (systemPrompt) expect(prompt).toContain(systemPrompt);
    }
  } finally {
    config.systemPrompt = prior;
    rmSync(turnRoot, { recursive: true, force: true });
  }
});
