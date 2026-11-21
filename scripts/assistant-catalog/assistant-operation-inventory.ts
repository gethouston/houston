import type {
  AssistantCatalog,
  AssistantParameter,
} from "./assistant-catalog-types.ts";

function closed(schema: Record<string, unknown>): boolean {
  if ("enum" in schema || "const" in schema) return true;
  if (!Array.isArray(schema.anyOf)) return false;
  const branches = (schema.anyOf as Record<string, unknown>[]).filter(
    (s) => s.type !== "null",
  );
  return branches.length > 0 && branches.every(closed);
}

function paramKind(param: AssistantParameter): string {
  if (closed(param.schema)) return "enum";
  if (param.resolver) return `resolved:${param.resolver}`;
  return param.unresolved ? `open: ${param.unresolved}` : "free text";
}

const cell = (value: string): string =>
  value.replaceAll("|", "\\|").replaceAll("\n", " ");

export function operationInventory(catalog: AssistantCatalog): string[] {
  return [
    "## Operation policies and parameter resolution",
    "",
    "Confirmation means the app asks the user and mints a receipt for that exact call before it happens. A parameter reads as `enum` (its schema carries every value), `resolved:<list>` (the app matches an id or the exact name against that live list and refuses with the values that exist), `open:<reason>` (it names something no live list covers, and where to read it instead), or `free text`.",
    "A person's message can grant one `createAgent` call with the constrained name, color and `seed.claudeMd` shape; the grant expires after ten minutes and is consumed once.",
    "",
    "| Operation | Method | Confirmation | Hidden reason | Parameters |",
    "| --- | --- | --- | --- | --- |",
    ...catalog.operations.map((op) => {
      const confirmation = op.confirm
        ? "confirmed: host approval required"
        : `unconfirmed: ${op.unconfirmed ?? (op.route?.method === "GET" ? "read-only HTTP GET" : op.hidden ? "withheld from dispatch" : "no callable route")}`;
      const params =
        op.params
          .map((param) => `${param.name}: ${paramKind(param)}`)
          .join("; ") || "none";
      return `| \`${op.name}\` | ${op.route?.method ?? "unroutable"} | ${cell(confirmation)} | ${cell(op.hiddenReason ?? "visible")} | ${cell(params)} |`;
    }),
  ];
}
