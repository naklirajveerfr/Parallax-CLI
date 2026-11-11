import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { runTurn } from '../agent/agent.js';
import { buildSystemPrompt } from '../agent/prompt.js';
import {
  apiKeySource,
  configDir,
  configPath,
  isProvider,
  PROVIDER_LABELS,
  providerAuthProblem,
  resolveApiKey,
  saveConfig,
  type ParallaxConfig,
} from '../config.js';
import {
  canLogin,
  createProvider,
  getPreset,
  resolveProviderSettings,
  type ProviderSettings,
} from '../providers/index.js';
import type { Message, Provider } from '../providers/types.js';
import { userText } from '../providers/types.js';
import { Approvals, tools } from '../tools/index.js';
import { showConfig } from './config-cmd.js';
import { runProvidersCommand } from './providers-cmd.js';
import { Renderer } from '../ui/render.js';
import { promptSecretDuring } from '../ui/input.js';
import { c } from '../util/colors.js';
import { describeError, ParallaxError } from '../util/errors.js';
import { VERSION } from '../version.js';

export interface ReplOptions {
  config: ParallaxConfig;
  settings: ProviderSettings;
  system: string;
  cwd: string;
  allowOutside: boolean;
  yes: boolean;
  maxSteps?: number;
  maxTokens?: number;
}

const HELP = `Commands
  /help              show this help
  /exit, /quit       leave ParallaxCLI
  /clear             forget the conversation
  /model [name]      show or switch the model
  /provider [name]   show or switch provider (see /providers)
  /providers         list all providers and their auth
  /login             store an API key for the current provider
  /config            show saved configuration
  /tools             list available tools
  /cost              show session token usage

Tips
  End a line with \\ to continue on the next line.
  Ctrl+C cancels the current turn; press it again at the prompt to quit.
  Ask for a shell command you want run; every command asks for approval.`;

function historyPath(): string {
  return join(configDir(), 'history');
}

async function loadHistory(): Promise<string[]> {
  try {
    const raw = await readFile(historyPath(), 'utf8');
    return raw.split('\n').filter((line) => line.trim() !== '');
  } catch {
    return [];
  }
}

async function saveHistory(lines: string[]): Promise<void> {
  try {
    await mkdir(configDir(), { recursive: true, mode: 0o700 });
    await writeFile(historyPath(), `${lines.slice(-300).join('\n')}\n`, { mode: 0o600 });
  } catch {
    // History is a convenience; never fail a session over it.
  }
}

function shortenHome(path: string): string {
  const home = homedir();
  return path === home ? '~' : path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

function promptMark(): string {
  return `${c.border('┃')} ${c.accent('›')} `;
}

function continuationMark(): string {
  return `${c.border('┃')} ${c.muted('·')} `;
}

export async function runRepl(options: ReplOptions): Promise<void> {
  const render = new Renderer();
  let config = options.config;
  let settings = options.settings;
  let provider: Provider | null = null;
  let system = options.system;
  let messages: Message[] = [];
  const totals = { inputTokens: 0, outputTokens: 0 };
  let abortController: AbortController | null = null;

  // Load history before creating the readline interface: readline starts
  // consuming stdin immediately, and any line emitted while we await is lost.
  const history = await loadHistory();

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    historySize: 300,
  });

  const ask = (question: string): Promise<string> =>
    new Promise((resolve) => {
      rl.question(question, (answer) => resolve(answer));
    });

  const approvals = new Approvals(options.yes ? 'yes' : 'ask', ask);

  const existingHistory = (rl as unknown as { history?: string[] }).history;
  if (Array.isArray(existingHistory)) {
    for (const line of history) existingHistory.unshift(line);
  }

  rl.on('SIGINT', () => {
    if (abortController) {
      abortController.abort();
      render.info('  cancelling…');
      return;
    }
    rl.close();
  });

  const prompt = (continuation = false) => {
    if (!rl.terminal) return;
    rl.setPrompt(continuation ? continuationMark() : promptMark());
    rl.prompt();
  };

  const promptAfterTurn = () => {
    if (rl.terminal) process.stdout.write('\n');
    prompt();
  };

  const rebuildSystem = () => {
    system = buildSystemPrompt({
      cwd: options.cwd,
      platform: `${process.platform} ${process.arch}`,
      model: settings.model,
      provider: settings.provider,
      allowOutside: options.allowOutside,
    });
  };

  const authState = (): string => {
    const preset = getPreset(settings.provider);
    if (!preset) return c.yellow('unknown provider');
    if (preset.kind === 'mock' || preset.auth === 'none') return c.muted('not required');
    if (preset.kind === 'azure' || preset.kind === 'vertex') return c.muted('cloud credentials');
    const key = settings.apiKey;
    if (key) return `${c.success('key set')} ${c.muted(`(${apiKeySource(settings.provider)})`)}`;
    return `${c.yellow('no key')} ${c.muted('· send a message and I’ll ask')}`;
  };

  /** Ask for a key, store it, and return it. Returns null when nothing was entered. */
  const captureKey = async (): Promise<string | null> => {
    const preset = getPreset(settings.provider);
    if (!preset) return null;
    if (preset.kind === 'mock' || preset.auth === 'none') {
      render.info(`${preset.label} needs no key.`);
      return null;
    }
    if (!canLogin(preset)) {
      render.warn(`${preset.label} uses cloud credentials, not an API key.`);
      if (preset.notes) render.info(`  ${preset.notes}`);
      return null;
    }

    const label = preset.id === 'copilot' ? 'GitHub token' : 'API key';
    const env = preset.envKeys[0];
    render.note(
      `${preset.label} needs an ${label}.`,
      `Paste it below to store it in ${configPath()}${env ? `, or set ${env}` : ''}.`,
    );

    const key = await promptSecretDuring(rl, `  ${promptMark()}`);
    if (!key) {
      render.warn(`No ${label.toLowerCase()} entered.`);
      return null;
    }
    config.apiKeys[preset.id] = key;
    await saveConfig(config);
    settings = { ...settings, apiKey: key };
    provider = null;
    render.info(`Saved ${label} for ${preset.label}.`);
    return key;
  };

  /** Build the provider on demand so startup works without credentials. */
  const ensureProvider = async (): Promise<Provider> => {
    if (provider) return provider;

    // Pick up keys saved or exported since startup.
    settings = { ...settings, apiKey: settings.apiKey ?? resolveApiKey(config, settings.provider) };

    const problem = providerAuthProblem(settings);
    if (problem) {
      const preset = getPreset(settings.provider);
      if (!preset) throw new ParallaxError(problem, 'Run /providers to see the list.');
      if (preset.kind === 'unsupported') {
        throw new ParallaxError(problem, preset.notes ?? 'Run /providers to see supported providers.');
      }
      // Missing account/gateway env vars cannot be fixed by pasting a key.
      if (problem.startsWith('Missing environment variable')) {
        throw new ParallaxError(problem, preset.notes ?? 'Set it and try again.');
      }
      if (!process.stdin.isTTY) {
        throw new ParallaxError(
          problem,
          `Run \`parallax login --provider ${preset.id}\`${preset.envKeys[0] ? ` or set ${preset.envKeys[0]}` : ''} first.`,
        );
      }
      if (!canLogin(preset)) throw new ParallaxError(problem, preset.notes);
      const key = await captureKey();
      if (!key) throw new ParallaxError(problem, 'Send another message to try again.');
    }

    provider = createProvider(settings);
    return provider;
  };

  const switchProvider = async (name: string): Promise<void> => {
    if (!isProvider(name)) {
      render.warn(`Unknown provider "${name}". Run /providers for the list.`);
      return;
    }
    try {
      settings = resolveProviderSettings(config, { provider: name });
      provider = null;
      config.provider = name;
      config = { ...config };
      await saveConfig(config);
      rebuildSystem();
      render.info(`Provider: ${PROVIDER_LABELS[settings.provider]} · ${settings.model}`);
      if (providerAuthProblem(settings)) render.info('  No key yet; you’ll be asked when you send a message.');
    } catch (error) {
      const described = describeError(error);
      render.error(described.message, described.hint);
    }
  };

  const switchModel = async (name: string): Promise<void> => {
    try {
      settings = { ...settings, model: name };
      provider = null;
      config.models[settings.provider] = name;
      await saveConfig(config);
      rebuildSystem();
      render.info(`Model: ${name} (${settings.provider})`);
    } catch (error) {
      const described = describeError(error);
      render.error(described.message, described.hint);
    }
  };

  const handleCommand = async (input: string): Promise<'continue' | 'exit'> => {
    const [command, ...rest] = input.slice(1).split(/\s+/);
    const argument = rest.join(' ').trim();

    switch (command) {
      case 'help':
      case '?':
        process.stdout.write(`\n${HELP}\n\n`);
        return 'continue';
      case 'exit':
      case 'quit':
      case 'q':
        return 'exit';
      case 'clear':
        messages = [];
        render.info('Conversation cleared.');
        return 'continue';
      case 'login':
        await captureKey();
        rebuildSystem();
        return 'continue';
      case 'model':
        if (argument) await switchModel(argument);
        else process.stdout.write(`${PADLINE}model: ${c.bold(settings.model)} ${c.muted(`(${settings.provider})`)}\n`);
        return 'continue';
      case 'provider': {
        if (!argument) {
          process.stdout.write(
            `${PADLINE}provider: ${c.bold(settings.provider)} ${c.muted(`(${PROVIDER_LABELS[settings.provider]})`)}\n`,
          );
          return 'continue';
        }
        await switchProvider(argument);
        return 'continue';
      }
      case 'providers':
        runProvidersCommand();
        return 'continue';
      case 'config':
        await showConfig(config);
        return 'continue';
      case 'tools':
        for (const tool of tools) {
          process.stdout.write(`  ${c.bold(tool.spec.name.padEnd(12))} ${c.muted(tool.spec.description.split('.')[0] ?? '')}\n`);
        }
        return 'continue';
      case 'cost':
        process.stdout.write(
          `${PADLINE}session: ${c.bold(String(totals.inputTokens))} input tokens · ${c.bold(String(totals.outputTokens))} output tokens\n`,
        );
        return 'continue';
      default:
        render.warn(`Unknown command /${command}. Type /help.`);
        return 'continue';
    }
  };

  const handleTurn = async (text: string): Promise<void> => {
    if (rl.terminal) process.stdout.write('\n');
    let active: Provider;
    try {
      active = await ensureProvider();
    } catch (error) {
      const described = describeError(error);
      render.error(described.message, described.hint);
      return;
    }

    messages.push(userText(text));
    abortController = new AbortController();

    try {
      const result = await runTurn({
        provider: active,
        system,
        messages,
        render,
        maxSteps: options.maxSteps,
        maxTokens: options.maxTokens,
        context: {
          cwd: options.cwd,
          approvals,
          allowOutside: options.allowOutside,
          signal: abortController.signal,
        },
      });
      messages = result.messages;
      totals.inputTokens += result.usage.inputTokens;
      totals.outputTokens += result.usage.outputTokens;
    } catch (error) {
      const described = describeError(error);
      render.error(described.message, described.hint);
      // Drop the unanswered user message so a retry does not duplicate it.
      messages.pop();
    } finally {
      abortController = null;
    }
  };

  render.banner({
    version: VERSION,
    provider: settings.provider,
    model: settings.model,
    cwd: shortenHome(options.cwd),
    auth: authState(),
  });

  prompt();

  let continuation = '';
  for await (const line of rl) {
    if (continuation) {
      continuation += `\n${line}`;
      if (line.endsWith('\\')) {
        continuation = continuation.slice(0, -1);
        prompt(true);
        continue;
      }
      const full = continuation;
      continuation = '';
      await handleTurn(full);
      promptAfterTurn();
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      prompt();
      continue;
    }

    if (trimmed.endsWith('\\')) {
      continuation = `${trimmed.slice(0, -1)}`;
      prompt(true);
      continue;
    }

    if (trimmed.startsWith('/')) {
      const outcome = await handleCommand(trimmed);
      if (outcome === 'exit') break;
      prompt();
      continue;
    }

    await handleTurn(trimmed);
    promptAfterTurn();
  }

  rl.close();
  const finalHistory = (rl as unknown as { history?: string[] }).history;
  if (Array.isArray(finalHistory)) {
    await saveHistory([...finalHistory].reverse());
  }

  if (totals.inputTokens > 0 || totals.outputTokens > 0) {
    process.stdout.write(
      c.muted(`\n  session: ${totals.inputTokens} input tokens · ${totals.outputTokens} output tokens\n`),
    );
  }
  process.stdout.write(c.muted('  bye\n'));
}

const PADLINE = '  ';
