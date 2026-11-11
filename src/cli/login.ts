import { c } from '../util/colors.js';
import {
  configPath,
  isProvider,
  loadConfig,
  maskKey,
  resolveModel,
  saveConfig,
  type ParallaxConfig,
} from '../config.js';
import { getPreset, isAvailable } from '../providers/registry.js';
import { promptSecret } from '../ui/input.js';

export async function runLogin(options: {
  provider?: string;
  apiKey?: string;
}): Promise<void> {
  const config: ParallaxConfig = await loadConfig();

  const providerName = options.provider ?? config.provider;
  if (!isProvider(providerName)) {
    throw new Error(`Unknown provider "${providerName}". Run \`parallax providers\` to list them.`);
  }

  const preset = getPreset(providerName);
  if (!preset) throw new Error(`Unknown provider "${providerName}".`);

  if (!isAvailable(preset)) {
    throw new Error(`${preset.label} is not supported yet. ${preset.notes ?? ''}`);
  }
  if (preset.kind === 'mock') {
    throw new Error('The mock provider is offline and needs no key. Try `parallax --provider mock`.');
  }
  if (preset.auth === 'none') {
    throw new Error(`${preset.label} runs locally and needs no API key. Try \`parallax --provider ${preset.id}\`.`);
  }
  if (preset.auth === 'custom') {
    throw new Error(
      `${preset.label} does not use a stored key. ${preset.notes ?? 'Configure its environment variables instead.'}`,
    );
  }

  const keyLabel = preset.id === 'copilot' ? 'GitHub token' : 'API key';
  const envHint = preset.envKeys.length > 0 ? preset.envKeys.join(' or ') : 'its environment variables';

  process.stdout.write(`${c.bold('ParallaxCLI login')}\n`);
  process.stdout.write(`  provider  ${c.bold(preset.id)} ${c.dim(`(${preset.label})`)}\n`);
  process.stdout.write(`  model     ${resolveModel(config, preset.id)}\n`);
  process.stdout.write(
    c.dim(`  Stored in ${configPath()} with 0600 permissions. ${envHint} also works.\n`),
  );
  if (preset.notes) process.stdout.write(c.dim(`  ${preset.notes}\n`));
  for (const key of preset.requiredEnv ?? []) {
    if (!process.env[key]) process.stdout.write(c.yellow(`  Also set ${key} in your environment.\n`));
  }

  const key = options.apiKey?.trim() || (await promptSecret(`  ${keyLabel}: `));
  if (!key) throw new Error(`No ${keyLabel.toLowerCase()} entered.`);

  config.provider = preset.id;
  config.apiKeys[preset.id] = key;
  await saveConfig(config);

  process.stdout.write(`\n${c.green('✓')} Stored ${maskKey(key)} for ${preset.label}.\n`);
  process.stdout.write(`${c.dim(`  ${configPath()}`)}\n`);
  process.stdout.write(`${c.dim('  Try: ')}parallax -p "say hello"\n`);
}
