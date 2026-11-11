import { c } from '../util/colors.js';
import { summarizeOutput, truncate } from '../util/text.js';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function formatInline(text: string): string {
  let out = text.replace(/`([^`]+)`/g, (_match, code: string) => c.cyan(code));
  out = out.replace(/\*\*([^*]+)\*\*/g, (_match, bold: string) => c.bold(bold));
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, url: string) => `${label} ${c.dim(`(${url})`)}`);
  return out;
}

export class Renderer {
  private buffer = '';
  private inFence = false;
  private spinner: NodeJS.Timeout | null = null;
  private spinnerLabel = '';
  private spinnerFrame = 0;
  private wroteText = false;
  private needsSeparator = false;

  startThinking(label = 'thinking'): void {
    this.stopThinking();
    if (!process.stdout.isTTY) return;
    this.spinnerLabel = label;
    this.spinnerFrame = 0;
    process.stderr.write(`${c.dim(`${SPINNER_FRAMES[0]} ${label}…`)}`);
    this.spinner = setInterval(() => {
      this.spinnerFrame = (this.spinnerFrame + 1) % SPINNER_FRAMES.length;
      process.stderr.write(`\r\x1b[2K${c.dim(`${SPINNER_FRAMES[this.spinnerFrame]} ${this.spinnerLabel}…`)}`);
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
    if (this.wroteText) process.stdout.write('\n');
    this.wroteText = false;
  }

  private writeLine(line: string): void {
    if (this.needsSeparator) {
      process.stdout.write('\n');
      this.needsSeparator = false;
    }

    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      this.inFence = !this.inFence;
      process.stdout.write(`${c.dim(trimmed)}\n`);
      this.wroteText = true;
      return;
    }

    if (this.inFence) {
      process.stdout.write(`${c.gray(line)}\n`);
      this.wroteText = true;
      return;
    }

    let out = line;
    if (/^#{1,6}\s/.test(trimmed)) {
      out = c.bold(c.cyan(trimmed.replace(/^#{1,6}\s+/, '')));
    } else if (/^(\s*)[-*]\s+/.test(line)) {
      out = line.replace(/^(\s*)[-*]\s+/, (_m, space: string) => `${space}${c.cyan('•')} `);
      out = formatInline(out);
    } else if (/^\s*>\s?/.test(line)) {
      out = c.dim(line);
    } else if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      out = c.dim('─'.repeat(Math.min(40, process.stdout.columns ?? 40)));
    } else {
      out = formatInline(line);
    }

    process.stdout.write(`${out}\n`);
    this.wroteText = true;
  }

  toolCall(name: string, input: Record<string, unknown>): void {
    this.stopThinking();
    process.stdout.write(`${c.green('⏺')} ${c.bold(name)} ${c.dim(describeInput(name, input))}\n`);
  }

  toolResult(ok: boolean, content: string, elapsedMs: number): void {
    const icon = ok ? c.green('⎿') : c.red('✗');
    const body = summarizeOutput(content.trim(), 10, 1600);
    const timing = elapsedMs >= 1500 ? ` ${c.dim(`· ${(elapsedMs / 1000).toFixed(1)}s`)}` : '';
    const indented = body
      .split('\n')
      .map((line, index) => (index === 0 ? `${icon}  ${line}${timing}` : `   ${line}`))
      .join('\n');
    process.stdout.write(`${c.dim(indented)}\n`);
    this.needsSeparator = true;
  }

  info(message: string): void {
    process.stdout.write(`${c.dim(message)}\n`);
  }

  warn(message: string): void {
    process.stdout.write(`${c.yellow('!')} ${message}\n`);
  }

  error(message: string, hint?: string): void {
    process.stdout.write(`${c.red('✗')} ${message}\n`);
    if (hint) process.stdout.write(`${c.dim(`  ${hint}`)}\n`);
  }

  usage(inputTokens: number, outputTokens: number, elapsedMs: number): void {
    if (inputTokens === 0 && outputTokens === 0) return;
    const seconds = (elapsedMs / 1000).toFixed(1);
    process.stdout.write(
      `${c.dim(`  ${formatTokens(inputTokens)} in · ${formatTokens(outputTokens)} out · ${seconds}s`)}\n`,
    );
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
