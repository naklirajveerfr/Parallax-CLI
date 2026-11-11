import { c } from '../util/colors.js';
import {
  configPath,
  isProvider,
  loadConfig,
  maskKey,
  PROVIDER_LABELS,
  resolveModel,
  saveConfig,
  type ParallaxConfig,
  type ProviderId,
} from '../config.js';
import { promptSecret } from '../ui/input.js';

export async function runLogin(options: {
  provider?: string;
  apiKey?: string;
}): Promise<void> {
  const config: ParallaxConfig = await loadConfig();

  const providerName = options.provider ?? config.provider;
  if (!isProvider(providerName) || providerName === 'mock') {
    throw new Error(`Cannot log in to "${providerName}". Use anthropic, openai, or openrouter.`);
  }
  const provider = providerName as ProviderId;

  process.stdout.write(`${c.bold('ParallaxCLI login')}\n`);
  process.stdout.write(`  provider  ${provider} ${c.dim(`(${PROVIDER_LABELS[provider]})`)}\n`);
  process.stdout.write(
    c.dim(`  The key is stored in ${configPath()} with 0600 permissions.\n`),
  );
  if (provider === 'openai') {
    process.stdout.write(
      c.dim('  Works with OpenAI, Groq, Together, and local Ollama/LM Studio.\n'),
    );
  }
  if (provider === 'openrouter') {
    process.stdout.write(
      c.dim(`  One key for hundreds of models. Default model: ${resolveModel(config, provider)}.\n`),
    );
    process.stdout.write(c.dim('  Switch models with `/model anthropic/claude-opus-4.1` in-session.\n'));
  }

  const key = options.apiKey?.trim() || (await promptSecret('  API key: '));
  if (!key) throw new Error('No API key entered.');

  config.provider = provider;
  config.apiKeys[provider] = key;
  await saveConfig(config);

  process.stdout.write(`\n${c.green('✓')} Stored ${maskKey(key)} for ${provider}.\n`);
  process.stdout.write(`${c.dim(`  ${configPath()}`)}\n`);
  process.stdout.write(`${c.dim('  Try: ')}parallax -p "say hello"\n`);
}
