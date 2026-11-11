import { c } from '../util/colors.js';
import {
  apiKeySource,
  configPath,
  isProvider,
  loadConfig,
  maskKey,
  resolveApiKey,
  resolveBaseUrl,
  resolveModel,
  saveConfig,
  PROVIDER_LABELS,
  PROVIDERS,
  type ParallaxConfig,
} from '../config.js';
import { promptSecret } from '../ui/input.js';

export async function showConfig(config: ParallaxConfig): Promise<void> {
  const provider = config.provider;
  const key = resolveApiKey(config, provider);
  const source = key ? apiKeySource(provider) : 'none';
  const baseUrl = resolveBaseUrl(config, provider);

  const rows: [string, string][] = [
    ['file', configPath()],
    ['provider', `${provider} ${c.dim(`(${PROVIDER_LABELS[provider]})`)}`],
    ['model', resolveModel(config, provider)],
    ['base url', baseUrl ?? c.dim('(provider default)')],
    ['api key', key ? `${maskKey(key)} ${c.dim(`(${source})`)}` : c.yellow('(not set)')],
  ];

  process.stdout.write(`${c.bold('ParallaxCLI configuration')}\n`);
  for (const [label, value] of rows) {
    process.stdout.write(`  ${label.padEnd(9)} ${value}\n`);
  }
  if (key && source === 'env') {
    process.stdout.write(`${c.dim('  Environment variables take precedence over the stored key.')}\n`);
  }
}

export async function runConfigCommand(args: string[]): Promise<void> {
  const config = await loadConfig();
  const [subcommand, key, ...rest] = args;

  if (!subcommand) {
    await showConfig(config);
    return;
  }

  if (subcommand === 'path') {
    process.stdout.write(`${configPath()}\n`);
    return;
  }

  if (subcommand === 'get') {
    if (!key) throw new Error('Usage: parallax config get <provider|model|base-url|api-key>');
    process.stdout.write(`${await readValue(config, key)}\n`);
    return;
  }

  if (subcommand === 'unset') {
    if (!key) throw new Error('Usage: parallax config unset <model|base-url|api-key>');
    const provider = config.provider;
    switch (key) {
      case 'model':
        delete config.models[provider];
        break;
      case 'base-url':
        delete config.baseUrls[provider];
        break;
      case 'api-key':
        delete config.apiKeys[provider];
        break;
      default:
        throw new Error(`Cannot unset "${key}".`);
    }
    await saveConfig(config);
    process.stdout.write(`${c.green('✓')} Cleared ${key} for ${provider}.\n`);
    return;
  }

  if (subcommand === 'set') {
    if (!key) throw new Error('Usage: parallax config set <provider|model|base-url|api-key> <value>');
    const value = rest.join(' ');
    const provider = config.provider;

    switch (key) {
      case 'provider': {
        const name = value.trim();
        if (!isProvider(name)) throw new Error(`Unknown provider "${name}". Use ${PROVIDERS.join(', ')}.`);
        config.provider = name;
        break;
      }
      case 'model':
        if (!value.trim()) throw new Error('Model name cannot be empty.');
        config.models[provider] = value.trim();
        break;
      case 'base-url':
        config.baseUrls[provider] = value.trim();
        break;
      case 'api-key': {
        const secret = value.trim() || (await promptSecret('API key: '));
        if (!secret) throw new Error('No key provided.');
        config.apiKeys[provider] = secret;
        break;
      }
      default:
        throw new Error(`Unknown setting "${key}". Use provider, model, base-url, or api-key.`);
    }

    await saveConfig(config);
    process.stdout.write(`${c.green('✓')} Saved ${key} for ${config.provider}.\n`);
    return;
  }

  throw new Error(`Unknown subcommand "${subcommand}". Try: parallax config [set|get|unset|path]`);
}

async function readValue(config: ParallaxConfig, key: string): Promise<string> {
  const provider = config.provider;
  switch (key) {
    case 'provider':
      return config.provider;
    case 'model':
      return resolveModel(config, provider);
    case 'base-url':
      return resolveBaseUrl(config, provider) ?? '';
    case 'api-key': {
      const value = resolveApiKey(config, provider);
      return value ? maskKey(value) : '';
    }
    default:
      throw new Error(`Unknown setting "${key}".`);
  }
}
