import type {
  Context,
  Model,
  SimpleStreamOptions,
  StreamOptions,
} from "@earendil-works/pi-ai";
import { bedrockProviderModule } from "@earendil-works/pi-ai/bedrock-provider";
// `registerApiProvider` is pi-ai's legacy global api-registry hook, preserved
// on `/compat` (the new `Models`/`Provider` collection API needs an
// instantiated registry we don't otherwise carry here).
import { registerApiProvider } from "@earendil-works/pi-ai/compat";

type BedrockBearerOptions<T extends StreamOptions> = T & {
  bearerToken?: string;
};

/**
 * pi-coding-agent resolves stored Houston API-key credentials into `apiKey`, but
 * pi-ai's Bedrock provider reads Bedrock API keys from `bearerToken` (or
 * AWS_BEARER_TOKEN_BEDROCK). Mirror the stored key into the provider-specific
 * option so Houston's normal paste-a-key flow works for Amazon Bedrock too.
 */
export function bedrockOptionsWithBearerToken<T extends StreamOptions>(
  options: T | undefined,
): BedrockBearerOptions<T> | undefined {
  if (!options?.apiKey) return options as BedrockBearerOptions<T> | undefined;
  const bedrockOptions = options as BedrockBearerOptions<T>;
  if (bedrockOptions.bearerToken) return bedrockOptions;
  return { ...bedrockOptions, bearerToken: options.apiKey };
}

/** Override pi-ai's Bedrock API handler with Houston's credential bridge. */
export function registerHoustonBedrockProvider(): void {
  registerApiProvider(
    {
      api: "bedrock-converse-stream",
      stream: (
        model: Model<"bedrock-converse-stream">,
        context: Context,
        options?: StreamOptions,
      ) =>
        bedrockProviderModule.stream(
          model,
          context,
          bedrockOptionsWithBearerToken(options),
        ),
      streamSimple: (
        model: Model<"bedrock-converse-stream">,
        context: Context,
        options?: SimpleStreamOptions,
      ) =>
        bedrockProviderModule.streamSimple(
          model,
          context,
          bedrockOptionsWithBearerToken(options),
        ),
    },
    "houston-bedrock-bearer-token",
  );
}
