import { stat } from 'node:fs/promises';
import { runTurn } from '../agent/agent.js';
import { buildSystemPrompt } from '../agent/prompt.js';
import { configPath, loadConfig, providerAuthProblem, saveConfig, type ParallaxConfig } from '../config.js';
import { canLogin, createProvider, getPreset, resolveProviderSettings, type ProviderSettings } from '../providers/index.js';
import { userText } from '../providers/types.js';
import { Approvals } from '../tools/index.js';
import { promptLine, promptSecret } from '../ui/input.js';
import { Renderer } from '../ui/render.js';
import { c } from '../util/colors.js';
import { ParallaxError, describeError } from '../util/errors.js';
import { VERSION } from '../version.js';
import { parseArgs, type CliOptions } from './args.js';
import { runConfigCommand } from './config-cmd.js';
import { runLogin } from './login.js';
import { runProvidersCommand } from './providers-cmd.js';
import { runRepl } from './repl.js';

const HELP = `
${c.bold('ParallaxCLI')} ${c.dim(`v${VERSION}`)} — a terminal coding agent

${c.bold('Usage')}
  parallax                       Start an interactive session
  parallax "prompt"              Run one prompt, then exit
  parallax -p "prompt"           Same, for scripts
  parallax login                 Store an API key
  parallax config                Show configuration

${c.bold('Commands')}
  parallax providers                List all providers and their auth
  parallax config set <key> <value>    provider | model | base-url | api-key
  parallax config unset <key>          Clear a setting for the current provider
  parallax config get <key>            Print a value
  parallax config path                 Print the config file path

${c.bold('Options')}
  -p, --print <text>        Run a single prompt non-interactively
      --provider <name>     Provider id (run: parallax providers)
      --model <name>        Model id override
      --base-url <url>      OpenAI-compatible endpoint (proxy, gateway, local)
      --api-key <key>       Key for this run only (prefer login/env)
      --cwd <dir>           Workspace directory (default: current directory)
  -y, --yes                 Auto-approve tool actions (use with care)
      --allow-outside       Allow writes outside the workspace
      --max-steps <n>       Tool loop limit per turn (default 40)
      --max-tokens <n>      Max output tokens per model call (default 8192)
  -v, --version             Print version
  -h, --help                Show this help

${c.bold('Environment')}
  PARALLAX_API_KEY              Key override for any provider
  ANTHROPIC_API_KEY             Anthropic
  OPENAI_API_KEY                OpenAI
  GEMINI_API_KEY                Google Gemini
  OPENROUTER_API_KEY            OpenRouter
  ...                           run: parallax providers, for the full list
  PARALLAX_PROVIDER, PARALLAX_MODEL, PARALLAX_BASE_URL
  NO_COLOR                      Disable colors

${c.bold('Examples')}
  parallax providers
  parallax login --provider anthropic
  parallax login --provider groq
  parallax login --provider openrouter
  parallax -p "explain this repo" --cwd ~/Lab/myproject
  parallax --provider ollama --model qwen3-coder
  parallax --provider openai --base-url http://localhost:11434/v1 --model llama3.1
  parallax --provider mock        # offline UI demo, no key needed
`;

export async function main(argv: string[]): Promise<void> {
  let options: CliOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${c.red('✗')} ${(error as Error).message}\n`);
    process.exitCode = 1;
    return;
  }

  if (options.command === 'help') {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  if (options.command === 'version') {
    process.stdout.write(`${VERSION}\n`);
    return;
  }

  try {
    switch (options.command) {
      case 'login':
        await runLogin({ provider: options.provider, apiKey: options.apiKey });
        return;
      case 'config':
        await runConfigCommand(options.configArgs);
        return;
      case 'providers':
        runProvidersCommand();
        return;
      default:
        await runChat(options, await loadConfig());
    }
  } catch (error) {
    const described = describeError(error);
    process.stderr.write(`${c.red('✗')} ${described.message}\n`);
    if (described.hint) process.stderr.write(`${c.dim(`  ${described.hint}`)}\n`);
    process.exitCode = 1;
  }
}

async function runChat(options: CliOptions, config: ParallaxConfig): Promise<void> {
  const info = await stat(options.cwd).catch(() => null);
  if (!info?.isDirectory()) {
    throw new ParallaxError(`Workspace not found: ${options.cwd}`, 'Check the --cwd path.');
  }

  const settings = resolveProviderSettings(config, options);
  const system = buildSystemPrompt({
    cwd: options.cwd,
    platform: `${process.platform} ${process.arch}`,
    model: settings.model,
    provider: settings.provider,
    allowOutside: options.allowOutside,
  });

  if (options.prompt !== undefined && options.prompt.trim() !== '') {
    const provider = await ensureProviderForOneShot(config, settings);
    await runOnce(options, provider, system);
    return;
  }

  await runRepl({
    config,
    settings,
    system,
    cwd: options.cwd,
    allowOutside: options.allowOutside,
    yes: options.yes,
    maxSteps: options.maxSteps,
    maxTokens: options.maxTokens,
  });
}

/**
 * One-shot runs fail fast in scripts, but an interactive terminal gets a chance
 * to paste the missing key instead of losing the prompt.
 */
async function ensureProviderForOneShot(
  config: ParallaxConfig,
  settings: ProviderSettings,
): Promise<ReturnType<typeof createProvider>> {
  const problem = providerAuthProblem(settings);
  const preset = getPreset(settings.provider);

  if (
    problem &&
    preset &&
    canLogin(preset) &&
    process.stdin.isTTY &&
    !problem.startsWith('Missing environment variable')
  ) {
    const label = preset.id === 'copilot' ? 'GitHub token' : 'API key';
    const env = preset.envKeys[0];
    process.stdout.write(`${c.yellow('!')} ${problem}\n`);
    process.stdout.write(
      `${c.dim(`  Paste it to store it in ${configPath()}${env ? `, or set ${env}` : ''}`)}\n`,
    );
    const key = await promptSecret(`  ${c.border('┃')} ${c.accent('›')} `);
    if (key) {
      config.apiKeys[preset.id] = key;
      await saveConfig(config);
      process.stdout.write(`${c.green('✓')} Saved ${label} for ${preset.label}.\n`);
      settings.apiKey = key;
    }
  }

  return createProvider(settings);
}

async function runOnce(
  options: CliOptions,
  provider: ReturnType<typeof createProvider>,
  system: string,
): Promise<void> {
  const render = new Renderer();
  const interactive = Boolean(process.stdin.isTTY);
  const approvals = new Approvals(options.yes ? 'yes' : interactive ? 'ask' : 'no', promptLine);
  const controller = new AbortController();

  const onSigint = () => controller.abort();
  process.once('SIGINT', onSigint);

  try {
    await runTurn({
      provider,
      system,
      messages: [userText(options.prompt ?? '')],
      render,
      maxSteps: options.maxSteps,
      maxTokens: options.maxTokens,
      context: {
        cwd: options.cwd,
        approvals,
        allowOutside: options.allowOutside,
        signal: controller.signal,
      },
    });
  } finally {
    process.removeListener('SIGINT', onSigint);
  }
}
