export const ANTHROPIC_TOKEN_PREFIXES = [
  "sk-ant-oat01",
  "sk-ant-api03",
] as const;

export const ANTHROPIC_TOKEN_HELP_URL =
  "https://console.anthropic.com/settings/keys";

const PASTE_INSTRUCTIONS =
  "Create an API key in the Anthropic Console and paste it here (starts with sk-ant-api03). A Claude setup token (sk-ant-oat01) also works.";

export type SetupTokenCallbacks = {
  onAuth: (info: { url: string; instructions: string }) => void;
  onManualCodeInput: () => Promise<string>;
};

export type SetupTokenDeps = {
  store: (key: string) => void;
};

export function isAnthropicToken(value: string): boolean {
  const v = value.trim();
  return ANTHROPIC_TOKEN_PREFIXES.some((p) => v.startsWith(p));
}

export function storeAnthropicToken(
  token: string,
  set: (key: string) => void,
): void {
  const key = token.trim();
  if (!key) throw new Error("No token provided");
  if (!isAnthropicToken(key))
    throw new Error(
      "That doesn't look like a Claude token (expected sk-ant-oat01… or sk-ant-api03…)",
    );
  set(key);
}

export async function runAnthropicSetupTokenLogin(
  cb: SetupTokenCallbacks,
  deps: SetupTokenDeps,
): Promise<void> {
  cb.onAuth({
    url: ANTHROPIC_TOKEN_HELP_URL,
    instructions: PASTE_INSTRUCTIONS,
  });
  const token = await cb.onManualCodeInput();
  storeAnthropicToken(token, deps.store);
}
