export function prefilledName(role: string): RegExp {
  const literal = role.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${literal}( \\d+)?$`);
}
