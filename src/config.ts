import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type ProviderId = 'anthropic' | 'openai' | 'mock';

export const PROVIDERS: ProviderId[] = ['anthropic', 'openai', 'mock'];

export interface ParallaxConfig {
  provider: ProviderId;
  /** Per-provider model overrides. */
  models: Partial<Record<ProviderId, string>>;
  /** Per-provider API base URLs (for proxies, OpenRouter, Ollama, ...). */
  baseUrls: Partial<Record<ProviderId, string>>;
  /** Per-provider API keys. Prefer env vars in shared machines. */
  apiKeys: Partial<Record<ProviderId, string>>;
}

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  anthropic: 'claude-sonnet-4-5',
  openai: 'gpt-4.1',
  mock: 'mock-1',
};

export const PROVIDER_ENV_KEYS: Record<ProviderId, string[]> = {
  anthropic: ['ANTHROPIC_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  mock: [],
};

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI-compatible',
  mock: 'Mock (offline demo)',
};

export function configDir(): string {
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'parallax');
}

export function configPath(): string {
  return join(configDir(), 'config.json');
}

export function defaultConfig(): ParallaxConfig {
  return {
    provider: 'anthropic',
    models: {},
    baseUrls: {},
    apiKeys: {},
  };
}

export async function loadConfig(): Promise<ParallaxConfig> {
  let raw: string;
  try {
    raw = await readFile(configPath(), 'utf8');
  } catch {
    return defaultConfig();
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ParallaxConfig>;
    return {
      ...defaultConfig(),
      ...parsed,
      models: parsed.models ?? {},
      baseUrls: parsed.baseUrls ?? {},
      apiKeys: parsed.apiKeys ?? {},
    };
  } catch {
    return defaultConfig();
  }
}

export async function saveConfig(config: ParallaxConfig): Promise<void> {
  await mkdir(configDir(), { recursive: true, mode: 0o700 });
  const target = configPath();
  await writeFile(target, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  // writeFile's mode is only applied on creation; enforce it on existing files too.
  await chmod(target, 0o600);
}

export function isProvider(value: string): value is ProviderId {
  return (PROVIDERS as string[]).includes(value);
}

export function resolveModel(config: ParallaxConfig, provider: ProviderId): string {
  return config.models[provider] ?? DEFAULT_MODELS[provider];
}

export function resolveBaseUrl(config: ParallaxConfig, provider: ProviderId): string | undefined {
  return config.baseUrls[provider];
}

/** Precedence: PARALLAX_API_KEY, then provider-specific env var, then stored key. */
export function resolveApiKey(config: ParallaxConfig, provider: ProviderId): string | undefined {
  if (provider === 'mock') return undefined;
  if (process.env.PARALLAX_API_KEY) return process.env.PARALLAX_API_KEY;
  for (const key of PROVIDER_ENV_KEYS[provider]) {
    const value = process.env[key];
    if (value) return value;
  }
  return config.apiKeys[provider];
}

export function maskKey(key: string | undefined): string {
  if (!key) return '(not set)';
  if (key.length <= 10) return `${key.slice(0, 2)}…${key.slice(-2)}`;
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

export function apiKeySource(provider: ProviderId): 'env' | 'config' | 'none' {
  if (provider === 'mock') return 'none';
  if (process.env.PARALLAX_API_KEY) return 'env';
  if (PROVIDER_ENV_KEYS[provider].some((key) => Boolean(process.env[key]))) return 'env';
  return 'config';
}
