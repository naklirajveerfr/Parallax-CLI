import { c, width } from '../util/colors.js';
import { formatDuration, summarizeOutput, truncate, wrapText } from '../util/text.js';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const PAD = '  ';

/** The vertical rail that runs down the left of assistant output. */
function rail(): string {
  return `${PAD}${c.border('┃')} `;
}

function columns(): number {
  const value = process.stdout.columns;
  return value && value > 20 ? value : 100;
}

function inline(text: string): string {
  let out = text.replace(/`([^`]+)`/g, (_match, code: string) => c.accent(code));
  out = out.replace(/\*\*([^*]+)\*\*/g, (_match, bold: string) => c.bold(bold));
  out = out.replace(/(^|[\s(])\*([^*\n]+)\*/g, (_m, lead: string, italic: string) => `${lead}${c.italic(italic)}`);
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, url: string) => `${label} ${c.muted(`(${url})`)}`);
  return out;
}

export interface Banner {
  version: string;
  provider: string;
  model: string;
  cwd: string;
  /** Human readable auth state, e.g. "key from environment". */
  auth: string;
}

export class Renderer {
  private buffer = '';
  private inFence = false;
  private fenceLang = '';
  private spinner: NodeJS.Timeout | null = null;
  private spinnerLabel = '';
  private spinnerFrame = 0;
  private streaming = false;
  private pendingSpace = false;

  /** Startup panel: wordmark in a rounded box, then session details. */
  banner(info: Banner): void {
    const title = '◆ parallax';
    const version = `v${info.version}`;
    const subtitle = 'terminal coding agent';
    const frame = Math.min(
      Math.max(width(title) + width(version) + 12, width(subtitle) + 10, 48),
      Math.max(40, columns() - 4),
    );
    const contentWidth = frame - 4;
    const row = (content: string): string =>
      `${PAD}${c.border('│')} ${content}${' '.repeat(Math.max(0, contentWidth - width(content)))} ${c.border('│')}`;
    const titlePad = ' '.repeat(Math.max(1, contentWidth - width(title) - width(version)));

    process.stdout.write('\n');
    process.stdout.write(`${PAD}${c.border(`╭${'─'.repeat(frame - 2)}╮`)}\n`);
    process.stdout.write(`${row(`${c.accent('◆')} ${c.bold('parallax')}${titlePad}${c.muted(version)}`)}\n`);
    process.stdout.write(`${row(c.muted(subtitle))}\n`);
    process.stdout.write(`${PAD}${c.border(`╰${'─'.repeat(frame - 2)}╯`)}\n`);

    const rows: [string, string][] = [
      ['model', `${c.bold(info.model)} ${c.muted(`(${info.provider})`)}`],
      ['workspace', c.bold(info.cwd)],
      ['auth', info.auth],
    ];
    for (const [label, value] of rows) {
      process.stdout.write(`${PAD}${c.muted(label.padEnd(10))}${value}\n`);
    }
    process.stdout.write(`${PAD}${c.muted('/help commands')} ${c.border('·')} ${c.muted('/exit quit')} ${c.border('·')} ${c.muted('ctrl+c cancel')}\n\n`);
  }

  startThinking(label = 'thinking'): void {
    this.stopThinking();
    if (!process.stdout.isTTY) return;
    this.spinnerLabel = label;
    this.spinnerFrame = 0;
    process.stderr.write(`${c.muted(`${SPINNER_FRAMES[0]} ${label}…`)}`);
    this.spinner = setInterval(() => {
      this.spinnerFrame = (this.spinnerFrame + 1) % SPINNER_FRAMES.length;
      process.stderr.write(`\r\x1b[2K${c.muted(`${SPINNER_FRAMES[this.spinnerFrame]} ${this.spinnerLabel}…`)}`);
    }, 90);
  }

  stopThinking(): void {
    if (this.spinner) {
      clearInterval(this.spinner);
      this.spinner = null;
      process.stderr.write('\r\x1b[2K');
    }
  }

  /** Stream a text chunk, rendering complete lines with light markdown. */
  text(chunk: string): void {
    this.stopThinking();
    if (!this.streaming && chunk.length > 0) {
      this.gap();
      this.streaming = true;
    }
    this.buffer += chunk;
    let newline = this.buffer.indexOf('\n');
    while (newline !== -1) {
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      this.writeLine(line);
      newline = this.buffer.indexOf('\n');
    }
  }

  endText(): void {
    this.stopThinking();
    if (this.buffer) {
      this.writeLine(this.buffer);
      this.buffer = '';
    }
    if (this.streaming) this.pendingSpace = true;
    this.streaming = false;
  }

  private gap(): void {
    if (this.pendingSpace) {
      process.stdout.write('\n');
      this.pendingSpace = false;
    }
  }

  private line(text = ''): void {
    process.stdout.write(`${rail()}${text}\n`);
  }

  private writeLine(line: string): void {
    const trimmed = line.trim();
    const available = Math.max(20, columns() - PAD.length - 2);

    if (trimmed.startsWith('```')) {
      if (this.inFence) {
        this.line(c.border('╰─'));
        this.inFence = false;
        this.fenceLang = '';
      } else {
        this.inFence = true;
        this.fenceLang = trimmed.slice(3).trim();
        this.line(`${c.border('╭─')} ${this.fenceLang ? c.muted(this.fenceLang) : ''}`.trimEnd());
      }
      return;
    }

    if (this.inFence) {
      for (const part of wrapText(line, available - 2).split('\n')) {
        this.line(`${c.border('│')} ${c.gray(part)}`);
      }
      return;
    }

    if (trimmed === '') {
      this.line(c.border(''));
      return;
    }

    if (/^#{1,6}\s/.test(trimmed)) {
      const text = trimmed.replace(/^#{1,6}\s+/, '');
      for (const part of wrapText(text, available).split('\n')) {
        this.line(c.bold(c.accent(part)));
      }
      return;
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      this.line(c.border('─'.repeat(Math.min(40, available))));
      return;
    }

    if (/^\s*>\s?/.test(line)) {
      const text = line.replace(/^\s*>\s?/, '');
      for (const part of wrapText(text, available - 2).split('\n')) {
        this.line(`${c.border('▎')} ${c.muted(part)}`);
      }
      return;
    }

    const bullet = /^(\s*)[-*]\s+/.exec(line);
    if (bullet) {
      const indent = bullet[1] ?? '';
      const text = line.slice(bullet[0].length);
      this.wrapProse(text, available - indent.length - 2, `${indent}${c.accent('•')} `, `${indent}  `);
      return;
    }

    const numbered = /^(\s*)(\d{1,3}[.)])\s+/.exec(line);
    if (numbered) {
      const indent = numbered[1] ?? '';
      const marker = numbered[2] ?? '';
      const text = line.slice(numbered[0].length);
      this.wrapProse(text, available - indent.length - marker.length - 1, `${indent}${c.accent(marker)} `, `${indent}${' '.repeat(marker.length)} `);
      return;
    }

    this.wrapProse(line, available, '', '');
  }

  /** Write prose, wrapping to width and keeping list markers on the first line. */
  private wrapProse(text: string, width: number, firstPrefix: string, restPrefix: string): void {
    const parts = wrapText(text, Math.max(12, width)).split('\n');
    parts.forEach((part, index) => {
      this.line(`${index === 0 ? firstPrefix : restPrefix}${inline(part)}`);
    });
  }

  toolCall(name: string, input: Record<string, unknown>): void {
    this.stopThinking();
    this.gap();
    const detail = describeInput(name, input);
    process.stdout.write(
      `${rail()}${c.accentDim('╭─')} ${c.bold(c.accent(name))}${detail ? ` ${c.muted(detail)}` : ''}\n`,
    );
  }

  toolResult(ok: boolean, content: string, elapsedMs: number): void {
    const body = summarizeOutput(content.trim(), 12, 1800);
    const available = Math.max(20, columns() - PAD.length - 4);
    if (body) {
      for (const line of body.split('\n')) {
        process.stdout.write(`${rail()}${c.border('│')} ${c.dim(truncate(line, available))}\n`);
      }
    }
    const status = ok ? c.success('done') : c.danger('failed');
    process.stdout.write(`${rail()}${c.border('╰─')} ${status} ${c.muted(`· ${formatDuration(elapsedMs)}`)}\n`);
    this.pendingSpace = true;
  }

  /** A bar-prefixed notice used for auth prompts and other callouts. */
  note(message: string, hint?: string): void {
    this.gap();
    this.line(message);
    if (hint) this.line(c.muted(hint));
    this.pendingSpace = false;
  }

  info(message: string): void {
    process.stdout.write(`${PAD}${c.muted(message)}\n`);
  }

  warn(message: string): void {
    process.stdout.write(`${PAD}${c.yellow('!')} ${message}\n`);
  }

  error(message: string, hint?: string): void {
    process.stdout.write(`${PAD}${c.danger('✗')} ${message}\n`);
    if (hint) process.stdout.write(`${PAD}  ${c.muted(hint)}\n`);
  }

  usage(inputTokens: number, outputTokens: number, elapsedMs: number): void {
    if (inputTokens === 0 && outputTokens === 0) return;
    this.gap();
    const seconds = (elapsedMs / 1000).toFixed(1);
    process.stdout.write(
      `${PAD}${c.border('┃')} ${c.muted(`${formatTokens(inputTokens)} in · ${formatTokens(outputTokens)} out · ${seconds}s`)}\n`,
    );
    this.pendingSpace = true;
  }
}

function formatTokens(tokens: number): string {
  if (tokens < 1000) return String(tokens);
  return `${(tokens / 1000).toFixed(1)}k`;
}

function describeInput(name: string, input: Record<string, unknown>): string {
  if (name === 'bash' && typeof input.command === 'string') {
    return truncate(input.command.replace(/\s+/g, ' '), 100);
  }
  const path = input.path ?? input.pattern;
  const extra = input.offset ? `:${input.offset}` : '';
  if (typeof path === 'string') return truncate(`${path}${extra}`, 100);
  const json = JSON.stringify(input);
  return truncate(json === '{}' ? '' : json, 90);
}
