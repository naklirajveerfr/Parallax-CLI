import { c, width } from './colors.js';

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

export function truncateMiddle(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Wrap text to a maximum visible width, preserving existing newlines. */
export function wrapText(text: string, columns: number): string {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    if (width(line) <= columns) {
      out.push(line);
      continue;
    }
    let current = '';
    for (const word of line.split(' ')) {
      if (width(current) + (current ? 1 : 0) + width(word) > columns && current) {
        out.push(current);
        current = word;
      } else {
        current = current ? `${current} ${word}` : word;
      }
    }
    if (current) out.push(current);
  }
  return out.join('\n');
}

/** Prefix every line of a block, e.g. for indented tool output. */
export function indent(text: string, prefix = '  '): string {
  return text
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
}

export function summarizeOutput(text: string, maxLines = 8, maxChars = 4000): string {
  const clipped = text.length > maxChars ? `${text.slice(0, maxChars)}\n… (${text.length - maxChars} more characters)` : text;
  const lines = clipped.split('\n');
  if (lines.length <= maxLines) return clipped;
  const head = lines.slice(0, Math.ceil(maxLines / 2));
  const tail = lines.slice(-Math.floor(maxLines / 2));
  const hidden = lines.length - head.length - tail.length;
  return `${head.join('\n')}\n${c.dim(`… ${hidden} lines hidden …`)}\n${tail.join('\n')}`;
}
