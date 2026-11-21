import { applyServedAzureEndpoint } from "../ai/azure-openai";
import {
  applyServedCredential,
  type ServedCredential,
} from "../auth/auth-file";
import { TurnSetupError } from "./turn-layout";

export type TurnCredentialWriter = (
  authPath: string,
  credential: ServedCredential,
  dataDir: string,
) => void;

const defaultWriter: TurnCredentialWriter = (authPath, credential, dataDir) => {
  applyServedCredential(authPath, credential);
  applyServedAzureEndpoint(
    credential.provider,
    credential.enterpriseUrl,
    dataDir,
  );
};

export function writeTurnCredential(
  authPath: string,
  credential: ServedCredential,
  dataDir: string,
  writer: TurnCredentialWriter = defaultWriter,
): void {
  try {
    writer(authPath, credential, dataDir);
  } catch (error) {
    if (error instanceof TurnSetupError) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new TurnSetupError(
      "credential_write_failed",
      `credential setup failed: ${detail}`,
      { cause: error },
    );
  }
}
