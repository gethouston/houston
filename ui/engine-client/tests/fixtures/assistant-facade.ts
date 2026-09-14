/**
 * The fixture facade: which factory is mounted at which namespace. Stands in
 * for `packages/sdk/src/sdk.ts`, and is what names every module operation.
 */

import {
  createThingsModule,
  type FixtureModuleContext,
} from "./assistant-module.ts";

export class FixtureSdk {
  readonly things: ReturnType<typeof createThingsModule>;

  constructor(ctx: FixtureModuleContext) {
    this.things = createThingsModule(ctx);
  }
}
