import { DENIED_SEGMENTS } from "../../session/tools/fs-guard-containment";

// WHY: Claude Code applies Read denies to Grep, Glob and cat, and Edit denies to Write. ADR-0009
export const CREDENTIAL_PERMISSION_RULES: readonly string[] = [
  ...DENIED_SEGMENTS,
].flatMap((segment) =>
  ["Read", "Edit"].flatMap((tool) => [
    `${tool}(**/${segment})`,
    `${tool}(**/${segment}/**)`,
  ]),
);
