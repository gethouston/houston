import { expect, test } from "vitest";
import { mapMcpResult, rankTools } from "./tool-mapping";

test("ranks token overlap and caps results at ten", () => {
  const tools = Array.from({ length: 12 }, (_, index) => ({
    name: `echo_${index}`,
    description: index === 11 ? "echo message" : "echo",
    inputSchema: { type: "object" as const },
  }));
  const ranked = rankTools(tools, "echo message");
  expect(ranked).toHaveLength(10);
  expect(ranked[0]?.tool.name).toBe("echo_11");
});

test("maps structured, text, and error MCP results", () => {
  expect(
    mapMcpResult({
      content: [{ type: "text", text: "fallback" }],
      structuredContent: { value: 1 },
    }),
  ).toEqual({ successful: true, data: { value: 1 } });
  expect(
    mapMcpResult({
      content: [
        { type: "text", text: "first" },
        { type: "text", text: "second" },
      ],
      isError: true,
    }),
  ).toEqual({
    successful: false,
    data: "first\nsecond",
    error: "first\nsecond",
  });
});
