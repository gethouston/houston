import { DENIED_SEGMENTS } from "../../session/tools/fs-guard-containment";

export const CREDENTIAL_PERMISSION_RULES: readonly string[] = [
  ...DENIED_SEGMENTS,
].flatMap((segment) =>
  ["Read", "Edit"].flatMap((tool) => [
    `${tool}(**/${segment})`,
    `${tool}(**/${segment}/**)`,
  ]),
);
