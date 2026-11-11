import {
  resolveApiKey,
  resolveBaseUrl,
  resolveModel,
  isProvider,
  PROVIDERS,
  type ParallaxConfig,
  type ProviderId,
} from '../config.js';
import { ParallaxError } from '../util/errors.js';
import { createAnthropicProvider } from './anthropic.js';
import { createMockProvider } from './mock.js';
import { createOpenAIProvider } from './openai.js';
import type { Provider } from './types.js';

export * from './types.js';

export interface ProviderSettings {
  provider: ProviderId;
  model: string;
  baseUrl?: string;
  apiKey?: string;
}

export interface ProviderFlags {
  provider?: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
}

export function resolveProviderSettings(config: ParallaxConfig, flags: ProviderFlags = {}): ProviderSettings {
  const providerName = flags.provider ?? process.env.PARALLAX_PROVIDER ?? config.provider;

  if (!isProvider(providerName)) {
    throw new ParallaxError(
      `Unknown provider "${providerName}".`,
      `Use one of: ${PROVIDERS.join(', ')}.`,
    );
  }

  return {
    provider: providerName,
    model: flags.model ?? process.env.PARALLAX_MODEL ?? resolveModel(config, providerName),
    baseUrl: flags.baseUrl ?? process.env.PARALLAX_BASE_URL ?? resolveBaseUrl(config, providerName),
    apiKey: flags.apiKey ?? resolveApiKey(config, providerName),
  };
}

export function createProvider(settings: ProviderSettings): Provider {
  const { provider, model, baseUrl, apiKey } = settings;

  switch (provider) {
    case 'anthropic':
      if (!apiKey) {
        throw new ParallaxError(
          'No Anthropic API key found.',
          'Run `parallax login --provider anthropic`, or set ANTHROPIC_API_KEY / PARALLAX_API_KEY.',
        );
      }
      return createAnthropicProvider({ apiKey, model, baseUrl });

    case 'openai':
      if (!apiKey && !baseUrl) {
        throw new ParallaxError(
          'No OpenAI API key found.',
          'Run `parallax login --provider openai`, or set OPENAI_API_KEY. For local servers, set a base URL: `parallax config set base-url http://localhost:11434/v1`.',
        );
      }
      return createOpenAIProvider({ apiKey, model, baseUrl });

    case 'openrouter':
      if (!apiKey) {
        throw new ParallaxError(
          'No OpenRouter API key found.',
          'Run `parallax login --provider openrouter`, or set OPENROUTER_API_KEY.',
        );
      }
      return createOpenAIProvider({ apiKey, model, baseUrl });

    case 'mock':
      return createMockProvider();
  }
}
