import type { ApprovalArg } from "@houston/protocol/approval";
import type { ConfirmationSummary } from "./summary";

export function hireSummary(args: ApprovalArg[]): ConfirmationSummary {
  const name = args.find((arg) => arg.name === "name")?.value;
  const color = args.find((arg) => arg.name === "color")?.value;
  const source = args.find((arg) => arg.name === "seed.claudeMd")?.value;
  const frontmatter = source?.match(
    /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/,
  );
  const role = frontmatter?.[1]
    ?.split(/\r?\n/)
    .find((line) => /^role\s*:/i.test(line))
    ?.replace(/^role\s*:\s*/i, "")
    .trim()
    .replace(/^['"]|['"]$/g, "");
  const body = source?.slice(frontmatter?.[0].length ?? 0).trim();
  const detail = [
    color ? `Color: ${color}` : "",
    role ? `Role: ${role}` : "",
    body ? `Instructions:\n${body}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    title: name ? `Hire ${name}?` : "Hire a new AI Employee?",
    ...(detail ? { detail } : {}),
    args,
  };
}
