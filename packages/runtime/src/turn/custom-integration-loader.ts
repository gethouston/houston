type CustomIntegrationModules = [
  typeof import("@houston/host/src/integrations/custom/executor-host"),
  typeof import("@houston/host/src/integrations/custom/manager"),
  typeof import("@houston/host/src/integrations/custom/provider"),
  typeof import("@houston/host/src/integrations/custom/secrets"),
  typeof import("@houston/host/src/integrations/custom/store"),
];

let processModules: Promise<CustomIntegrationModules> | undefined;

export function preloadCustomIntegrationModules(): Promise<CustomIntegrationModules> {
  if (processModules) return processModules;
  const load = Promise.all([
    import("@houston/host/src/integrations/custom/executor-host"),
    import("@houston/host/src/integrations/custom/manager"),
    import("@houston/host/src/integrations/custom/provider"),
    import("@houston/host/src/integrations/custom/secrets"),
    import("@houston/host/src/integrations/custom/store"),
  ]);
  const guarded = load.catch((error: unknown) => {
    if (processModules === guarded) processModules = undefined;
    throw error;
  });
  processModules = guarded;
  return guarded;
}
