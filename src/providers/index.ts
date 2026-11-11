import {
  resolveApiKey,
  resolveBaseUrl,
  resolveModel,
  isProvider,
  type ParallaxConfig,
} from '../config.js';import { ParallaxError } from '../util/errors.js';
import { createAnthropicProvider } from './anthropic.js';
import { createAzureProvider } from './azure.js';
import { createCopilotProvider } from './copilot.js';
import { createMockProvider } from './mock.js';
import { createOpenAIProvider } from './openai.js';
import { getPreset, PRESETS, type ProviderPreset } from './registry.js';
import type { Provider } from './types.js';
import { createVertexProvider } from './vertex.js';

export * from './types.js';
export { PRESETS, getPreset, isAvailable, canLogin } from './registry.js';
export type { ProviderPreset } from './registry.js';

export interface ProviderSettings {
  provider: string;
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
  const provider = flags.provider ?? process.env.PARALLAX_PROVIDER ?? config.provider;

  if (!isProvider(provider)) {
    throw new ParallaxError(
      `Unknown provider "${provider}".`,
      'Run `parallax providers` to list the available providers.',
    );
  }

  return {
    provider,
    model: flags.model ?? process.env.PARALLAX_MODEL ?? resolveModel(config, provider),
    baseUrl: flags.baseUrl ?? process.env.PARALLAX_BASE_URL ?? resolveBaseUrl(config, provider),
    apiKey: flags.apiKey ?? resolveApiKey(config, provider),
  };
}

/** Expand `${ENV_VAR}` placeholders in a base URL (Cloudflare account ids, Snowflake account, ...). */
export function interpolateBaseUrl(value: string): string {
  return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_match, name: string) => {
    const resolved = process.env[name];
    if (!resolved) {
      throw new ParallaxError(
        `Missing environment variable ${name}.`,
        `Set ${name} and try again. Run \`parallax providers\` to see what each provider needs.`,
      );
    }
    return resolved;
  });
}

function requireApiKey(preset: ProviderPreset, apiKey: string | undefined, baseUrl?: string): string | undefined {
  if (apiKey) return apiKey;
  if (preset.auth === 'none') return undefined;
  // A custom base URL means an OpenAI-compatible local server or proxy; keys are optional there.
  if (preset.id === 'openai' && baseUrl) return undefined;

  const env = preset.envKeys[0];
  throw new ParallaxError(
    `No ${preset.label} API key found.`,
    `Run \`parallax login --provider ${preset.id}\`${env ? `, or set ${env}` : ''}.`,
  );
}

export function createProvider(settings: ProviderSettings): Provider {
  const preset = getPreset(settings.provider);
  if (!preset) {
    throw new ParallaxError(`Unknown provider "${settings.provider}".`, 'Run `parallax providers`.');
  }

  if (preset.kind === 'unsupported') {
    throw new ParallaxError(
      `${preset.label} is not supported yet.`,
      preset.notes ?? 'Run `parallax providers` to see supported providers.',
    );
  }

  for (const key of preset.requiredEnv ?? []) {
    if (!process.env[key]) {
      throw new ParallaxError(
        `Missing environment variable ${key} for ${preset.label}.`,
        preset.notes ?? `Set ${key} and try again.`,
      );
    }
  }

  const baseUrl = settings.baseUrl ? interpolateBaseUrl(settings.baseUrl) : undefined;

  switch (preset.kind) {
    case 'anthropic': {
      const apiKey = requireApiKey(preset, settings.apiKey);
      return createAnthropicProvider({ apiKey: apiKey as string, model: settings.model, baseUrl });
    }

    case 'openai': {
      const apiKey = requireApiKey(preset, settings.apiKey, baseUrl);
      return createOpenAIProvider({ apiKey, model: settings.model, baseUrl });
    }

    case 'azure':
      return createAzureProvider({ apiKey: settings.apiKey, model: settings.model });

    case 'vertex':
      return createVertexProvider(settings.model);

    case 'copilot':
      return createCopilotProvider({
        model: settings.model,
        githubToken: requireApiKey(preset, settings.apiKey) as string,
      });

    case 'mock':
      return createMockProvider();
  }
}

export { PRESETS as ALL_PRESETS };
