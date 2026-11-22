import {
  createOpenAICompatible,
  type MetadataExtractor,
} from '@ai-sdk/openai-compatible';
import {
  NoSuchModelError,
  type LanguageModelV4,
  type ProviderV4,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  loadApiKey,
  withoutTrailingSlash,
  type FetchFunction,
} from '@ai-sdk/provider-utils';

/** Default OpenAI-compatible endpoint of the c0mpute network. */
export const C0MPUTE_BASE_URL = 'https://c0mpute.com/v1';

/**
 * Model ids served on c0mpute. `auto` and the `auto:<effort>` aliases ask the
 * c0mpute router to pick an open model per request. Concrete ids come and go
 * with the nodes online (GET https://c0mpute.com/v1/models lists them), so any
 * string is accepted.
 */
export type C0mputeModelId =
  | 'auto'
  | 'auto:fast'
  | 'auto:standard'
  | 'auto:high'
  | 'auto:max'
  | 'qwen3:4b'
  | 'qwen2.5-coder:7b'
  | 'qwen2.5-coder:14b'
  | 'qwen3-coder:30b'
  | 'qwen3.8:27b'
  | 'devstral:24b'
  | 'deepseek-coder-v2:16b'
  | 'nemotron-3-nano:4b'
  | 'nemotron-3-nano:30b'
  | (string & {});

export interface C0mputeProviderSettings {
  /**
   * c0mpute API key (`c0k_...`), from the keys tab of https://c0mpute.com/chat.
   * Defaults to the `C0MPUTE_API_KEY` environment variable.
   */
  apiKey?: string;
  /** Base URL. Defaults to `https://c0mpute.com/v1`. */
  baseURL?: string;
  /** Extra headers sent with every request. */
  headers?: Record<string, string>;
  /** Custom fetch, e.g. for testing or a proxy. */
  fetch?: FetchFunction;
}

export interface C0mputeProvider extends ProviderV4 {
  (modelId: C0mputeModelId): LanguageModelV4;
  languageModel(modelId: C0mputeModelId): LanguageModelV4;
  chatModel(modelId: C0mputeModelId): LanguageModelV4;
}

const DROPPED_FIELDS = ['tools', 'tool_choice', 'parallel_tool_calls'] as const;

/**
 * Shape a Chat Completions body for c0mpute. The c0mpute API accepts only
 * string message content and system/user/assistant roles, and does not do
 * tool calling, so:
 * - text-only content arrays are joined into one string,
 * - non-text parts (images, files) are dropped with a warning,
 * - `tools` / `tool_choice` are dropped with a warning.
 */
export function toC0mputeBody(
  body: Record<string, any>,
  warnings?: SharedV4Warning[],
): Record<string, any> {
  const out: Record<string, any> = { ...body };
  for (const field of DROPPED_FIELDS) {
    if (out[field] !== undefined) {
      if (field === 'tools') {
        warnings?.push({
          type: 'unsupported',
          feature: 'tools',
          details:
            'c0mpute does not support tool calling yet; tools were not sent to the model.',
        });
      }
      delete out[field];
    }
  }
  if (Array.isArray(out.messages)) {
    let droppedParts = false;
    out.messages = out.messages.map((message: Record<string, any>) => {
      if (!Array.isArray(message.content)) return message;
      const text = message.content
        .filter((part: any) => {
          const isText = part?.type === 'text' && typeof part.text === 'string';
          if (!isText) droppedParts = true;
          return isText;
        })
        .map((part: any) => part.text)
        .join('\n');
      return { ...message, content: text };
    });
    if (droppedParts) {
      warnings?.push({
        type: 'unsupported',
        feature: 'non-text message content',
        details:
          'c0mpute accepts text only; image and file parts were removed from the prompt.',
      });
    }
  }
  return out;
}

/** Exposes c0mpute's router trace (`x_c0mpute_route`) as providerMetadata.c0mpute.route. */
const routeMetadata: MetadataExtractor = {
  async extractMetadata({ parsedBody }) {
    const route = (parsedBody as any)?.x_c0mpute_route;
    return route ? { c0mpute: { route } } : undefined;
  },
  createStreamExtractor() {
    let route: unknown;
    return {
      processChunk(chunk: unknown) {
        const r = (chunk as any)?.x_c0mpute_route;
        if (r) route = r;
      },
      buildMetadata() {
        return route ? { c0mpute: { route: route as any } } : undefined;
      },
    };
  },
};

/** Create a c0mpute provider instance. */
export function createC0mpute(
  options: C0mputeProviderSettings = {},
): C0mputeProvider {
  const inner = createOpenAICompatible<C0mputeModelId, string, string, string>({
    name: 'c0mpute',
    baseURL: withoutTrailingSlash(options.baseURL) ?? C0MPUTE_BASE_URL,
    apiKey: () =>
      loadApiKey({
        apiKey: options.apiKey,
        environmentVariableName: 'C0MPUTE_API_KEY',
        description: 'c0mpute',
      }),
    headers: options.headers,
    fetch: options.fetch,
    supportsStructuredOutputs: false,
    transformRequestBody: toC0mputeBody,
    metadataExtractor: routeMetadata,
  });

  const languageModel = (modelId: C0mputeModelId) => inner.chatModel(modelId);
  const provider = ((modelId: C0mputeModelId) =>
    languageModel(modelId)) as C0mputeProvider;
  Object.assign(provider, {
    specificationVersion: 'v4' as const,
    languageModel,
    chatModel: languageModel,
    embeddingModel: (modelId: string) => {
      throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
    },
    imageModel: (modelId: string) => {
      throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
    },
  });
  return provider;
}

/** Default instance. Reads `C0MPUTE_API_KEY` at request time. */
export const c0mpute = createC0mpute();
