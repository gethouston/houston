export function adminViewEnabled(gates: {
  showOrganization: boolean;
  ready: boolean;
}): boolean {
  return gates.showOrganization || !gates.ready;
}
