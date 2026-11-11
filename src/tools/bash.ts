import { spawn } from 'node:child_process';
import { c } from '../util/colors.js';
import { asNumber, asString, clampOutput, type Tool } from './tool.js';

const DEFAULT_TIMEOUT = 120_000;
const MAX_TIMEOUT = 600_000;
const MAX_BUFFER = 4 * 1024 * 1024;

const RISKY_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\brm\s+(-[a-zA-Z]*[rRf][a-zA-Z]*\s+)+/, label: 'recursive/forced delete' },
  { pattern: /\bgit\s+reset\s+--hard\b/, label: 'discards uncommitted work' },
  { pattern: /\bgit\s+clean\s+-[a-zA-Z]*f/, label: 'deletes untracked files' },
  { pattern: /\bmkfs(\.\w+)?\b/, label: 'formats a filesystem' },
  { pattern: /\bdd\s+if=/, label: 'raw disk write' },
  { pattern: />\s*\/dev\/(sd|nvme|disk)/, label: 'writes to a block device' },
  { pattern: /\b(shutdown|reboot|halt)\b/, label: 'takes the machine down' },
  { pattern: /\b(curl|wget)\b[^|;]*\|\s*(sudo\s+)?(ba|z|fi)?sh\b/, label: 'pipes the internet into a shell' },
  { pattern: /\bchmod\s+-R\s+777\b/, label: 'opens permissions to everyone' },
  { pattern: /\bsudo\b/, label: 'runs with elevated privileges' },
];

function riskLabel(command: string): string | undefined {
  return RISKY_PATTERNS.find((entry) => entry.pattern.test(command))?.label;
}

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  aborted: boolean;
}

function execute(command: string, cwd: string, timeout: number, signal?: AbortSignal): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn('/bin/bash', ['-lc', command], {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let aborted = false;

    const append = (target: 'out' | 'err', chunk: Buffer) => {
      const text = chunk.toString('utf8');
      if (target === 'out') {
        if (stdout.length < MAX_BUFFER) stdout += text;
      } else if (stderr.length < MAX_BUFFER) {
        stderr += text;
      }
    };

    child.stdout.on('data', (chunk: Buffer) => append('out', chunk));
    child.stderr.on('data', (chunk: Buffer) => append('err', chunk));

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeout);

    const onAbort = () => {
      aborted = true;
      child.kill('SIGKILL');
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    child.on('error', (error) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve({ stdout, stderr: `${stderr}${error.message}`, exitCode: null, timedOut, aborted });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve({ stdout, stderr, exitCode: code, timedOut, aborted });
    });
  });
}

export const bashTool: Tool = {
  spec: {
    name: 'bash',
    description:
      'Run a shell command in the workspace and return its combined output. Use for builds, tests, git, and file inspection. Not interactive: no editors, REPLs, or sudo prompts.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to run with /bin/bash -lc.' },
        timeout_ms: { type: 'number', description: `Timeout in milliseconds (default ${DEFAULT_TIMEOUT}).` },
      },
      required: ['command'],
    },
  },

  async run(input, context) {
    const command = asString(input, 'command');
    const timeout = Math.min(Math.max(1000, asNumber(input, 'timeout_ms', DEFAULT_TIMEOUT) ?? DEFAULT_TIMEOUT), MAX_TIMEOUT);
    const cwd = context.cwd;

    const risk = riskLabel(command);
    const detail = [`${c.dim('$')} ${command}`, risk ? `${c.red(`⚠ ${risk}`)}` : `${c.dim(`timeout ${Math.round(timeout / 1000)}s · cwd ${cwd}`)}`].join('\n');

    const approved = await context.approvals.request('bash', 'Run shell command', detail);
    if (!approved) return { content: `User declined to run: ${command}`, isError: true };

    const result = await execute(command, cwd, timeout, context.signal);

    const parts: string[] = [];
    if (result.stdout) parts.push(result.stdout.trimEnd());
    if (result.stderr) parts.push(`${c.dim('--- stderr ---')}\n${result.stderr.trimEnd()}`);

    const status = result.aborted
      ? 'Command cancelled.'
      : result.timedOut
        ? `Command timed out after ${Math.round(timeout / 1000)}s.`
        : `Exit code: ${result.exitCode ?? 'unknown'}.`;

    parts.push(c.dim(status));

    return {
      content: clampOutput(parts.join('\n\n')),
      isError: result.timedOut || result.aborted || (result.exitCode !== 0 && result.exitCode !== null),
    };
  },
};
