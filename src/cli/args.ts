import { resolve } from 'node:path';

export type Command = 'chat' | 'login' | 'config' | 'help' | 'version';

export interface CliOptions {
  command: Command;
  prompt?: string;
  provider?: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  yes: boolean;
  allowOutside: boolean;
  cwd: string;
  maxSteps?: number;
  maxTokens?: number;
  /** Arguments after `parallax config ...`. */
  configArgs: string[];
}

function needValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith('-')) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

function toNumber(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Invalid number for ${flag}: ${value}`);
  return parsed;
}

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    command: 'chat',
    yes: false,
    allowOutside: false,
    cwd: process.cwd(),
    configArgs: [],
  };

  const words: string[] = [];
  let commandSet = false;
  let afterDoubleDash = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;

    if (afterDoubleDash) {
      words.push(arg);
      continue;
    }

    if (arg === '--') {
      afterDoubleDash = true;
      continue;
    }

    if (arg === '-h' || arg === '--help') {
      options.command = 'help';
      commandSet = true;
      continue;
    }
    if (arg === '-v' || arg === '--version') {
      options.command = 'version';
      commandSet = true;
      continue;
    }
    if (arg === '-y' || arg === '--yes') {
      options.yes = true;
      continue;
    }
    if (arg === '--allow-outside') {
      options.allowOutside = true;
      continue;
    }

    if (arg === '-p' || arg === '--print') {
      const value = needValue(argv, index, arg);
      options.prompt = options.prompt ? `${options.prompt}\n${value}` : value;
      index += 1;
      continue;
    }
    if (arg === '--provider') {
      options.provider = needValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--model') {
      options.model = needValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--base-url') {
      options.baseUrl = needValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--api-key') {
      options.apiKey = needValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--cwd') {
      options.cwd = resolve(needValue(argv, index, arg));
      index += 1;
      continue;
    }
    if (arg === '--max-steps') {
      options.maxSteps = toNumber(needValue(argv, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === '--max-tokens') {
      options.maxTokens = toNumber(needValue(argv, index, arg), arg);
      index += 1;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}. Run \`parallax --help\`.`);
    }

    if (!commandSet && (arg === 'login' || arg === 'config' || arg === 'help' || arg === 'version')) {
      options.command = arg;
      commandSet = true;
      continue;
    }

    if (options.command === 'config') {
      options.configArgs.push(arg);
      continue;
    }

    words.push(arg);
  }

  if (words.length > 0) {
    options.prompt = options.prompt ? `${options.prompt}\n${words.join(' ')}` : words.join(' ');
  }

  return options;
}
