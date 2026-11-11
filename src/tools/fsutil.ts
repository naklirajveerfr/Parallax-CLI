import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { ParallaxError } from '../util/errors.js';

export function expandHome(input: string): string {
  if (input === '~') return homedir();
  if (input.startsWith('~/')) return resolve(homedir(), input.slice(2));
  return input;
}

export function resolvePath(input: string, cwd: string): string {
  const expanded = expandHome(input);
  return isAbsolute(expanded) ? resolve(expanded) : resolve(cwd, expanded);
}

export function isInside(path: string, root: string): boolean {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

export function displayPath(path: string, cwd: string): string {
  const rel = relative(cwd, path);
  if (rel && !rel.startsWith('..') && !isAbsolute(rel)) return rel.split(sep).join('/');
  return path;
}

export function requireInside(path: string, root: string, action: string): void {
  if (!isInside(path, root)) {
    throw new ParallaxError(
      `Refusing to ${action} outside the workspace: ${path}`,
      'Start ParallaxCLI in a parent directory, or pass --allow-outside if you really mean it.',
    );
  }
}

export interface FileInfo {
  size: number;
  isFile: boolean;
  isDirectory: boolean;
}

export async function fileInfo(path: string): Promise<FileInfo | null> {
  try {
    const info = await stat(path);
    return { size: info.size, isFile: info.isFile(), isDirectory: info.isDirectory() };
  } catch {
    return null;
  }
}

export async function readTextFile(path: string, maxBytes = 2 * 1024 * 1024): Promise<string> {
  const info = await fileInfo(path);
  if (!info) throw new ParallaxError(`File not found: ${path}`);
  if (info.isDirectory) throw new ParallaxError(`That is a directory, not a file: ${path}`);
  if (info.size > maxBytes) {
    throw new ParallaxError(
      `File is too large (${Math.round(info.size / 1024)} KB, limit ${Math.round(maxBytes / 1024)} KB): ${path}`,
      'Use a shell command like `head`/`sed` to inspect parts of it.',
    );
  }
  const buffer = await readFile(path);
  if (buffer.subarray(0, 8192).includes(0)) {
    throw new ParallaxError(`Refusing to read binary file: ${path}`);
  }
  return buffer.toString('utf8');
}

export function lineCount(text: string): number {
  if (text === '') return 0;
  return text.split('\n').length;
}

export function withLineNumbers(text: string, startLine: number): string {
  const lines = text.split('\n');
  const width = String(startLine + lines.length - 1).length;
  return lines
    .map((line, index) => `${String(startLine + index).padStart(width, ' ')}| ${line}`)
    .join('\n');
}

export const IGNORED_DIRS = new Set([
  '.git',
  '.hg',
  '.svn',
  'node_modules',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.cache',
  '.venv',
  'venv',
  '__pycache__',
  'target',
  'vendor',
  '.idea',
  '.DS_Store',
]);

/** Convert a small glob (`*`, `**`, `?`) into a RegExp. */
export function globToRegExp(pattern: string): RegExp {
  let out = '^';
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i]!;
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        i += 1;
        if (pattern[i + 1] === '/') {
          i += 1;
          out += '(?:.*/)?';
        } else {
          out += '.*';
        }
      } else {
        out += '[^/]*';
      }
    } else if (char === '?') {
      out += '[^/]';
    } else if ('\\^$.|+()[]{}'.includes(char)) {
      out += `\\${char}`;
    } else {
      out += char;
    }
  }
  out += '$';
  return new RegExp(out);
}
