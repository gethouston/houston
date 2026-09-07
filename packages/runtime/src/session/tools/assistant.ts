import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import {
  type AssistantToolOptions,
  HOUSTON_CALL_TOOL_NAME,
  makeAssistantCallTool,
} from "./assistant-call";
import { findCallableOperation } from "./assistant-callable";
import {
  type AssistantOperationResult,
  assistantErrorResult,
  assistantTextResult,
} from "./assistant-result";
import { groupCounts, searchOperations } from "./assistant-search";
import {
  HOUSTON_RECALL_TOOL_NAME,
  makeHoustonRecallTool,
} from "./houston-recall";

/**
 * The ASSISTANT tool family: search the catalogue of user-facing Houston
 * operations, read one operation's contract, perform it, and search the
 * assistant's own long-lived conversation with the user.
 *
 * Three tools rather than one-per-operation because the catalog has hundreds of
 * entries — a tool each would flood every request's tool list — and because the
 * catalog is generated, so the tools must not need editing when it grows.
 *
 * No tool in this family throws: every refusal comes back as a result carrying
 * a named code (see assistant-result.ts). A dispatcher's failures are mostly
 * addressing mistakes the model can correct on its own, and an exception gives
 * it nothing to correct from.
 */

export const HOUSTON_CAPABILITIES_TOOL_NAME = "houston_capabilities";
export const HOUSTON_DESCRIBE_TOOL_NAME = "houston_describe";
export type { AssistantToolOptions } from "./assistant-call";
export { HOUSTON_CALL_TOOL_NAME } from "./assistant-call";
export { HOUSTON_RECALL_TOOL_NAME } from "./houston-recall";

/**
 * The family, in the order it is offered to the model: find, read, do, then
 * remember — `houston_recall` searches the conversation the other three act in.
 */
export const ASSISTANT_TOOL_NAMES: readonly string[] = [
  HOUSTON_CAPABILITIES_TOOL_NAME,
  HOUSTON_DESCRIBE_TOOL_NAME,
  HOUSTON_CALL_TOOL_NAME,
  HOUSTON_RECALL_TOOL_NAME,
];

const CapabilitiesParams = Type.Object({
  query: Type.Optional(
    Type.String({
      description:
        "Words to search for across operation names and descriptions, case-insensitive (e.g. 'routine', 'invite'). Omit it to see the groups instead.",
    }),
  ),
  group: Type.Optional(
    Type.String({
      description:
        "Restrict the search to one group, exactly as this tool spells it. Use it to list everything in a group.",
    }),
  ),
});
type CapabilitiesParams = Static<typeof CapabilitiesParams>;

/**
 * What one `houston_capabilities` call did, for logs and the tool UI. The two
 * views answer different questions, so they carry different counts rather than
 * one blurred shape padded with zeroes.
 */
export type AssistantCapabilitiesDetails =
  | { view: "groups"; groups: number; total: number }
  | { view: "search"; matched: number; returned: number; total: number };

const DescribeParams = Type.Object({
  operation: Type.String({
    description:
      "The exact operation name as houston_capabilities returned it. Never invent one.",
  }),
});
type DescribeParams = Static<typeof DescribeParams>;

export function makeAssistantCapabilitiesTool(opts: AssistantToolOptions) {
  return defineTool({
    name: HOUSTON_CAPABILITIES_TOOL_NAME,
    label: "What Houston can do",
    description:
      "Search everything you can do inside Houston on the user's behalf - the same actions they could take in the app themselves. Use it whenever they ask you to change, create, delete, schedule, or look something up in Houston, and before saying you cannot do something. Search with words from what they asked ('routine', 'invite', 'mission'); call it with no arguments first to see the groups. Everything it lists can actually be performed here, so trust it over your own memory of what Houston offers. Returns names and summaries only - read one operation's parameters with houston_describe, then perform it with houston_call.",
    promptSnippet: "See what Houston can do",
    parameters: CapabilitiesParams,
    executionMode: "parallel",
    async execute(
      _id: string,
      params: CapabilitiesParams,
    ): Promise<AgentToolResult<AssistantCapabilitiesDetails>> {
      if (!params.query?.trim() && !params.group?.trim()) {
        const groups = groupCounts(opts.catalog);
        const total = groups.reduce((sum, g) => sum + g.count, 0);
        return {
          content: [
            {
              type: "text" as const,
              text: `${JSON.stringify({ groups, total })}\n\nThese are the groups of things you can do. Search again with a group, or with words from what the user asked for.`,
            },
          ],
          details: { view: "groups", groups: groups.length, total },
        };
      }
      const found = searchOperations(opts.catalog, params);
      return {
        content: [
          {
            type: "text" as const,
            text: `${JSON.stringify(found)}\n\n${
              found.matched === 0
                ? "Nothing matched. Try different words, or call this tool with no arguments to see the groups before telling the user it cannot be done."
                : `${found.truncated ? "Trimmed to the first results - narrow with a group or sharper words. " : ""}"confirm" means the operation is hard to undo, so you must ask the user before performing it. Read the one you want with houston_describe.`
            }`,
          },
        ],
        details: {
          view: "search",
          matched: found.matched,
          returned: found.operations.length,
          total: found.total,
        },
      };
    },
  });
}

export function makeAssistantDescribeTool(opts: AssistantToolOptions) {
  return defineTool({
    name: HOUSTON_DESCRIBE_TOOL_NAME,
    label: "How an operation works",
    description:
      "Read one Houston operation's exact contract: every parameter, whether it is required, what shape it takes, and what it answers. Call it after houston_capabilities and before houston_call - never guess an operation's arguments.",
    promptSnippet: "Read a Houston operation",
    parameters: DescribeParams,
    executionMode: "parallel",
    async execute(
      _id: string,
      params: DescribeParams,
    ): Promise<AssistantOperationResult> {
      const op = findCallableOperation(opts.catalog, params.operation);
      if (!op) {
        return assistantErrorResult(params.operation, {
          code: "unknown_operation",
          message: `There is no operation called "${params.operation}". Search for the right one with houston_capabilities.`,
        });
      }
      const contract = JSON.stringify({
        name: op.name,
        group: op.group,
        description: op.description,
        confirm: op.confirm,
        params: op.params,
        returns: op.returns,
      });
      const guidance = op.confirm
        ? " This operation is hard to undo: tell the user exactly what it will do and get their answer before calling it with confirmed true."
        : "";
      return assistantTextResult(
        op.name,
        `${contract}\n\nPass these to houston_call keyed by parameter name.${guidance}`,
      );
    },
  });
}

/**
 * The whole family, built together: the catalog tools share one catalog + host
 * token, and `houston_recall` needs neither (it reads this runtime's own
 * transcript store) but ships from here so the OBJECT list can never drift from
 * {@link ASSISTANT_TOOL_NAMES} — pi exposes only their intersection, and a name
 * with no object behind it is invisible to the model with no error anywhere.
 */
export function makeAssistantTools(opts: AssistantToolOptions) {
  return [
    makeAssistantCapabilitiesTool(opts),
    makeAssistantDescribeTool(opts),
    makeAssistantCallTool(opts),
    makeHoustonRecallTool(),
  ];
}
