import { toolShortName } from "@houston-ai/chat";

const FILE_WRITE_TOOLS = new Set(["write", "edit", "multiedit", "multi_edit"]);

const FILE_CREATE_TOOLS = new Set(["write"]);

export function isFileWriteTool(name: string): boolean {
  return FILE_WRITE_TOOLS.has(toolShortName(name).toLowerCase());
}

export function isFileCreateTool(name: string): boolean {
  return FILE_CREATE_TOOLS.has(toolShortName(name).toLowerCase());
}
