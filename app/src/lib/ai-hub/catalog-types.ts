export type LabId =
  | "anthropic"
  | "openai"
  | "google"
  | "meta"
  | "mistral"
  | "qwen"
  | "deepseek"
  | "xai"
  | "amazon"
  | "minimax"
  | "zai"
  | "moonshot"
  | "cohere"
  | "nvidia"
  | "other";

export interface CatalogOffer {
  providerId: string;
  modelId: string;
  costInput?: number;
  costOutput?: number;
  context?: number;
  subscription: boolean;
}

export interface CatalogModel {
  key: string;
  name: string;
  lab: LabId;
  description?: string;
  reasoning: boolean;
  toolCall: boolean;
  imageGen: boolean;
  inputModalities: string[];
  knowledge?: string;
  releaseDate?: string;
  context?: number;
  output?: number;
  offers: CatalogOffer[];
}

export interface HubCatalog {
  models: CatalogModel[];
  byKey: Map<string, CatalogModel>;
  byProvider: Map<string, CatalogModel[]>;
  modelCount: number;
  offerCount: number;
}
