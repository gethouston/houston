import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  fauxAssistantMessage,
  fauxProvider,
  type TranscriptContext,
} from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import { HoustonAuthStore } from "../../auth/credential-store";
import { recoverFollowUpActions } from "../../session/follow-up-pass";
import { newInteractionHolder } from "../../session/interaction";
import { makeSuggestActionsTool } from "../../session/tools/suggest-actions";
import { createPiBackend } from "./backend";

const actions = [
  { id: "shorter", label: "Más corto", message: "Hazlo más corto." },
  { id: "review", label: "Revisar", message: "Revisa el resumen." },
];

test("the real recovery request is tool-free, small, on the turn model, and leaves history unchanged", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "suggestions-one-shot-"));
  const faux = fauxProvider({
    provider: "faux",
    api: "faux",
    models: [
      {
        id: "suggestions-model",
        reasoning: true,
        name: "Faux",
        contextWindow: 200000,
        maxTokens: 8192,
      },
    ],
  });
  const requests: TranscriptContext[] = [];
  const models: string[] = [];
  const reasoning: unknown[] = [];
  const respond: Parameters<typeof faux.setResponses>[0][number] = (
    context,
    options,
    _state,
    model,
  ) => {
    requests.push(structuredClone(context));
    models.push(model.id);
    reasoning.push(options?.reasoning);
    return fauxAssistantMessage(
      requests.length === 1
        ? "private earlier reply"
        : JSON.stringify({ actions }),
    );
  };
  faux.setResponses([respond, respond]);
  const auth = new HoustonAuthStore(join(cwd, "auth.json"));
  auth.set("faux", { type: "api_key", key: "faux-key" });
  const modelRuntime = await ModelRuntime.create({
    credentials: auth,
    modelsPath: join(cwd, "models.json"),
  });
  modelRuntime.registerNativeProvider(faux.provider);
  const backend = createPiBackend({
    workspaceDir: cwd,
    dataDir: cwd,
    modelRuntime,
    tools: ["suggest_actions"],
    customTools: [makeSuggestActionsTool()],
    systemPrompt: "private product prompt",
  });
  const session = await backend.createSession({
    conversationId: "c",
    model: faux.getModel(),
  });
  const frames: unknown[] = [];
  session.subscribe((frame) => frames.push(frame));
  try {
    await session.prompt("private earlier user context");
    const before = frames.length;
    const interaction = newInteractionHolder();
    // The faux API is on no follow-up allowlist (follow-up-models.ts); this
    // test is about the request, so the pass is let through.
    session.followUpPassServed = () => true;
    await recoverFollowUpActions({
      session,
      interaction,
      conversationId: "c",
      turnId: "t",
      userText: "Resume esto.",
      assistantText: "Aquí está el resumen.",
      failed: false,
      planMode: false,
      isStopped: () => false,
    });
    expect(requests).toHaveLength(2);
    expect(models).toEqual(["suggestions-model", "suggestions-model"]);
    expect(reasoning[1]).toBe("minimal");
    const request = requests[1];
    expect(
      request?.messages
        .filter((message) => message.role === "system")
        .flatMap((message) => message.toolsAdded ?? []),
    ).toEqual([]);
    expect(request?.messages).toHaveLength(2);
    expect(request?.messages[1]).toMatchObject({
      role: "user",
      content: [
        {
          type: "text",
          text: '{"user":"Resume esto.","reply":"Aquí está el resumen."}',
        },
      ],
    });
    const serialized = JSON.stringify(request);
    expect(serialized.length).toBeLessThan(2000);
    expect(serialized).not.toContain("private");
    expect(frames).toHaveLength(before);
    expect(existsSync(join(cwd, "settings.json"))).toBe(false);
    expect(interaction.suggestActions?.actions).toEqual(actions);
    faux.appendResponses([respond]);
    await session.prompt("next visible message");
    expect(requests).toHaveLength(3);
    expect(JSON.stringify(requests[2])).not.toContain("Resume esto.");
    expect(JSON.stringify(requests[2])).toContain(
      "private earlier user context",
    );
  } finally {
    session.dispose();
    rmSync(cwd, { recursive: true, force: true });
  }
});

for (const enabled of [true, false]) {
  test(`a real pi session's prompt and schema follow nextStepSuggestions=${enabled}`, async () => {
    const cwd = mkdtempSync(join(tmpdir(), "suggestions-gate-"));
    const faux = fauxProvider();
    const auth = new HoustonAuthStore(join(cwd, "auth.json"));
    const runtime = await ModelRuntime.create({
      credentials: auth,
      modelsPath: join(cwd, "models.json"),
    });
    runtime.registerNativeProvider(faux.provider);
    const backend = createPiBackend({
      workspaceDir: cwd,
      dataDir: cwd,
      modelRuntime: runtime,
      tools: ["suggest_actions"],
      customTools: [makeSuggestActionsTool()],
      systemPrompt:
        "Keep this.\n<next_step_suggestions>Call suggest_actions.</next_step_suggestions>",
    });
    const session = await backend.createSession({
      conversationId: "c",
      model: faux.getModel(),
      nextStepSuggestions: enabled,
    });
    const requests: TranscriptContext[] = [];
    faux.setResponses([
      (context) => {
        requests.push(structuredClone(context));
        return fauxAssistantMessage("All set.");
      },
    ]);
    try {
      await session.prompt("hello");
      const message = requests[0]?.messages.find(
        (message) => message.role === "system",
      );
      expect(JSON.stringify(message).includes("Call suggest_actions.")).toBe(
        enabled,
      );
      expect(
        message?.toolsAdded?.some((tool) => tool.name === "suggest_actions") ??
          false,
      ).toBe(enabled);
    } finally {
      session.dispose();
      rmSync(cwd, { recursive: true, force: true });
    }
  });
}
