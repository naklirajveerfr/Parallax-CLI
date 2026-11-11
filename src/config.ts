import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getPreset, PRESETS } from './providers/registry.js';

export type ProviderId = string;

export const PROVIDERS: string[] = PRESETS.map((preset) => preset.id);

export interface ParallaxConfig {
  provider: ProviderId;
  /** Per-provider model overrides. */
  models: Record<string, string>;
  /** Per-provider API base URLs (for proxies, gateways, self-hosted instances). */
  baseUrls: Record<string, string>;
  /** Per-provider API keys. Prefer env vars on shared machines. */
  apiKeys: Record<string, string>;
}

export const DEFAULT_MODELS: Record<string, string> = Object.fromEntries(
  PRESETS.map((preset) => [preset.id, preset.defaultModel]),
);

export const DEFAULT_BASE_URLS: Record<string, string> = Object.fromEntries(
  PRESETS.filter((preset) => preset.baseUrl).map((preset) => [preset.id, preset.baseUrl as string]),
);

export const PROVIDER_ENV_KEYS: Record<string, string[]> = Object.fromEntries(
  PRESETS.map((preset) => [preset.id, preset.envKeys]),
);

export const PROVIDER_LABELS: Record<string, string> = Object.fromEntries(
  PRESETS.map((preset) => [preset.id, preset.label]),
);

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
  return getPreset(value) !== undefined;
}

export function resolveModel(config: ParallaxConfig, provider: ProviderId): string {
  return config.models[provider] ?? getPreset(provider)?.defaultModel ?? '';
}

export function resolveBaseUrl(config: ParallaxConfig, provider: ProviderId): string | undefined {
  return config.baseUrls[provider] ?? getPreset(provider)?.baseUrl;
}

/** Precedence: PARALLAX_API_KEY, then provider-specific env vars, then stored key. */
export function resolveApiKey(config: ParallaxConfig, provider: ProviderId): string | undefined {
  const preset = getPreset(provider);
  if (preset?.kind === 'mock' || preset?.auth === 'none') return undefined;
  if (process.env.PARALLAX_API_KEY) return process.env.PARALLAX_API_KEY;
  for (const key of PROVIDER_ENV_KEYS[provider] ?? []) {
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
  const preset = getPreset(provider);
  if (!preset || preset.kind === 'mock' || preset.auth === 'none') return 'none';
  if (process.env.PARALLAX_API_KEY) return 'env';
  if ((PROVIDER_ENV_KEYS[provider] ?? []).some((key) => Boolean(process.env[key]))) return 'env';
  return 'config';
}
