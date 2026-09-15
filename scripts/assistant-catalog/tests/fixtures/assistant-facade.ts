/**
 * The fixture facade: which factory is mounted at which namespace. Stands in
 * for `packages/sdk/src/sdk.ts`, and is what names every module operation.
 */

import { createClaimsModule } from "./assistant-claims-module.ts";
import {
  createThingsModule,
  type FixtureModuleContext,
} from "./assistant-module.ts";

export class FixtureSdk {
  /** Mounted FIRST: its hidden twins and its tied names are read before theirs. */
  readonly gadgets: ReturnType<typeof createClaimsModule>;
  readonly things: ReturnType<typeof createThingsModule>;

  constructor(ctx: FixtureModuleContext) {
    this.gadgets = createClaimsModule(ctx);
    this.things = createThingsModule(ctx);
  }
}
