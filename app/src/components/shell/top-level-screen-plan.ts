/** Admin remains mounted while its gate resolves so it can show a neutral frame. */
export function adminViewEnabled(gates: {
  showOrganization: boolean;
  ready: boolean;
}): boolean {
  return gates.showOrganization || !gates.ready;
}
