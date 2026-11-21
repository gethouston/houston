import { expect, test } from "vitest";
import {
  type AgentRef,
  agentRefDirectory,
  describeAgentRef,
  matchAgentRefs,
  qualifiedAgentRef,
} from "./agent-refs";

const ref = (
  id: string,
  name: string,
  workspace: string,
  workspaceId = workspace.toLowerCase(),
): AgentRef => ({ id, name, workspace, workspaceId });

const HOME_LEGAL = ref("a-legal", "Legal", "Home", "ws-home");
const HOME_MKT = ref("a-mkt", "Marketing", "Home", "ws-home");
const WORK_MKT = ref("a-mkt-2", "Marketing", "Work", "ws-work");
const REFS = [HOME_LEGAL, HOME_MKT, WORK_MKT];

test("an id resolves alone, trimmed, even when a name would also match", () => {
  expect(matchAgentRefs(REFS, "a-mkt-2")).toEqual([WORK_MKT]);
  expect(matchAgentRefs(REFS, "  a-legal  ")).toEqual([HOME_LEGAL]);
});

test("a bare name answers with every space that uses it, never a pick", () => {
  expect(matchAgentRefs(REFS, "marketing")).toEqual([HOME_MKT, WORK_MKT]);
});

test("a qualified name separates them, by space name or by space id", () => {
  expect(matchAgentRefs(REFS, "Work/Marketing")).toEqual([WORK_MKT]);
  expect(matchAgentRefs(REFS, "ws-work/marketing")).toEqual([WORK_MKT]);
});

test("nothing matches an agent that is not a candidate", () => {
  expect(matchAgentRefs(REFS, "Sales")).toEqual([]);
});

test("a reference whose space has no name still matches by name", () => {
  const remote = ref("slug-1", "Dobby", "", "");
  expect(matchAgentRefs([remote], "dobby")).toEqual([remote]);
  expect(qualifiedAgentRef(remote)).toBe("Dobby");
  expect(describeAgentRef(remote)).toBe("Dobby (id slug-1)");
});

test("spells a qualified name and a directory the reader can pick from", () => {
  expect(qualifiedAgentRef(WORK_MKT)).toBe("Work/Marketing");
  expect(agentRefDirectory(REFS)).toBe(
    "Legal (id a-legal, in Home), Marketing (id a-mkt, in Home), Marketing (id a-mkt-2, in Work)",
  );
});
