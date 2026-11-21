export const agentRest = (path: string): string =>
  path.split("/").slice(3).join("/");
