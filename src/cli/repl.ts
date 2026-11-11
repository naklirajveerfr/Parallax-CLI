import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { runTurn } from '../agent/agent.js';
import { buildSystemPrompt } from '../agent/prompt.js';
import {
  configDir,
  isProvider,
  PROVIDER_LABELS,
  resolveApiKey,
  resolveModel,
  saveConfig,
  type ParallaxConfig,
} from '../config.js';
import { createProvider, resolveProviderSettings, type ProviderSettings } from '../providers/index.js';
import type { Message, Provider } from '../providers/types.js';
import { userText } from '../providers/types.js';
import { Approvals, tools } from '../tools/index.js';
import { showConfig } from './config-cmd.js';
import { Renderer } from '../ui/render.js';
import { c } from '../util/colors.js';
import { describeError } from '../util/errors.js';
import { VERSION } from '../version.js';

export interface ReplOptions {
  config: ParallaxConfig;
  settings: ProviderSettings;
  provider: Provider;
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
  /provider [name]   show or switch provider (anthropic, openai, openrouter, mock)
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

export async function runRepl(options: ReplOptions): Promise<void> {
  const render = new Renderer();
  let config = options.config;
  let settings = options.settings;
  let provider = options.provider;
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
    rl.setPrompt(continuation ? c.dim('… ') : c.bold(c.cyan('› ')));
    rl.prompt();
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

  const switchProvider = async (name: string): Promise<void> => {
    if (!isProvider(name)) {
      render.warn(`Unknown provider "${name}". Use anthropic, openai, openrouter, or mock.`);
      return;
    }
    try {
      const next = resolveProviderSettings(config, { provider: name });
      const created = createProvider(next);
      provider = created;
      settings = next;
      config.provider = name;
      config = { ...config };
      await saveConfig(config);
      rebuildSystem();
      render.info(`Provider: ${PROVIDER_LABELS[settings.provider]} · ${settings.model}`);
    } catch (error) {
      const described = describeError(error);
      render.error(described.message, described.hint);
    }
  };

  const switchModel = async (name: string): Promise<void> => {
    try {
      const next = { ...settings, model: name };
      const created = createProvider(next);
      provider = created;
      settings = next;
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
        process.stdout.write(`${HELP}\n`);
        return 'continue';
      case 'exit':
      case 'quit':
      case 'q':
        return 'exit';
      case 'clear':
        messages = [];
        render.info('Conversation cleared.');
        return 'continue';
      case 'model':
        if (argument) await switchModel(argument);
        else process.stdout.write(`  model: ${c.bold(settings.model)} ${c.dim(`(${settings.provider})`)}\n`);
        return 'continue';
      case 'provider': {
        if (!argument) {
          process.stdout.write(`  provider: ${c.bold(settings.provider)} ${c.dim(`(${PROVIDER_LABELS[settings.provider]})`)}\n`);
          return 'continue';
        }
        await switchProvider(argument);
        return 'continue';
      }
      case 'config':
        await showConfig(config);
        return 'continue';
      case 'tools':
        for (const tool of tools) process.stdout.write(`  ${c.bold(tool.spec.name.padEnd(12))} ${c.dim(tool.spec.description.split('.')[0] ?? '')}\n`);
        return 'continue';
      case 'cost':
        process.stdout.write(
          `  session: ${c.bold(String(totals.inputTokens))} input tokens · ${c.bold(String(totals.outputTokens))} output tokens\n`,
        );
        return 'continue';
      default:
        render.warn(`Unknown command /${command}. Type /help.`);
        return 'continue';
    }
  };

  const handleTurn = async (text: string): Promise<void> => {
    messages.push(userText(text));
    abortController = new AbortController();

    try {
      const result = await runTurn({
        provider,
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

  process.stdout.write(`\n${c.bold('ParallaxCLI')} ${c.dim(`v${VERSION}`)}\n`);
  process.stdout.write(
    `  ${c.cyan(settings.provider)} ${c.dim('·')} ${c.bold(settings.model)} ${c.dim('·')} ${c.dim(shortenHome(options.cwd))}\n`,
  );
  process.stdout.write(`  ${c.dim('/help for commands, /exit to quit')}\n\n`);

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
      prompt();
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
    prompt();
  }

  rl.close();
  const finalHistory = (rl as unknown as { history?: string[] }).history;
  if (Array.isArray(finalHistory)) {
    await saveHistory([...finalHistory].reverse());
  }

  if (totals.inputTokens > 0 || totals.outputTokens > 0) {
    process.stdout.write(
      c.dim(`\nSession: ${totals.inputTokens} input tokens · ${totals.outputTokens} output tokens\n`),
    );
  }
  process.stdout.write(c.dim('Goodbye.\n'));
}
