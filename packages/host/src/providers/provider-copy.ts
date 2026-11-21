import { providerName } from "./lookup";

export function sentenceProviderName(id: string): string {
  return providerName(id).replace(/\s*\(.*\)\s*$/, "");
}

export function routineProviderUnavailable(id: string): string {
  return `This routine runs on ${sentenceProviderName(id)}, which is not available here. Open the routine and pick another provider.`;
}

export function cloudProviderUnavailable(id: string): string {
  return `${sentenceProviderName(id)} is not available for cloud agents. Open the routine and pick another provider.`;
}
