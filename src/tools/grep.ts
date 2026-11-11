import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { c } from '../util/colors.js';
import { displayPath, globToRegExp, IGNORED_DIRS, resolvePath } from './fsutil.js';
import { asBoolean, asNumber, asString, clampOutput, type Tool } from './tool.js';

const MAX_MATCHES = 100;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

export const grepTool: Tool = {
  spec: {
    name: 'grep',
    description:
      'Search file contents with a JavaScript regular expression. Returns path:line: text. Use this to find code instead of reading whole files.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regular expression to search for.' },
        path: { type: 'string', description: 'File or directory to search. Defaults to the workspace root.' },
        include: { type: 'string', description: 'Only search files matching this glob, e.g. "*.ts".' },
        ignore_case: { type: 'boolean', description: 'Case-insensitive search.' },
        max_results: { type: 'number', description: `Maximum matches (default ${MAX_MATCHES}).` },
      },
      required: ['pattern'],
    },
  },

  async run(input, context) {
    const patternText = asString(input, 'pattern');
    const root = resolvePath(asString(input, 'path', '.'), context.cwd);
    const include = input.include ? asString(input, 'include') : undefined;
    const ignoreCase = asBoolean(input, 'ignore_case');
    const limit = Math.max(1, Math.floor(asNumber(input, 'max_results', MAX_MATCHES) ?? MAX_MATCHES));

    let regex: RegExp;
    try {
      regex = new RegExp(patternText, ignoreCase ? 'i' : '');
    } catch (error) {
      return { content: `Invalid regular expression: ${(error as Error).message}`, isError: true };
    }

    const includeMatcher = include ? globToRegExp(include) : undefined;
    const results: string[] = [];
    let scanned = 0;
    let truncated = false;

    const rootInfo = await stat(root).catch(() => null);
    if (!rootInfo) return { content: `Path not found: ${displayPath(root, context.cwd)}`, isError: true };

    const searchFile = async (full: string): Promise<void> => {
      if (results.length >= limit) {
        truncated = true;
        return;
      }
      const info = await stat(full).catch(() => null);
      if (!info?.isFile() || info.size > MAX_FILE_BYTES || info.size === 0) return;

      const rel = displayPath(full, context.cwd);
      if (includeMatcher && !includeMatcher.test(rel) && !includeMatcher.test(full.split('/').pop() ?? '')) return;

      const buffer = await readFile(full).catch(() => null);
      if (!buffer || buffer.subarray(0, 4096).includes(0)) return;
      scanned += 1;

      const lines = buffer.toString('utf8').split('\n');
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]!;
        if (!regex.test(line)) continue;
        const clipped = line.length > 240 ? `${line.slice(0, 240)}…` : line;
        results.push(`${c.cyan(rel)}:${c.yellow(String(index + 1))}: ${clipped.trim()}`);
        if (results.length >= limit) {
          truncated = true;
          return;
        }
      }
    };

    if (rootInfo.isFile()) {
      await searchFile(root);
    } else {
      const walk = async (dir: string): Promise<void> => {
        if (results.length >= limit) return;
        const entries = await readdir(dir, { withFileTypes: true }).catch(() => null);
        if (!entries) return;
        for (const entry of entries) {
          if (results.length >= limit) return;
          if (IGNORED_DIRS.has(entry.name)) continue;
          const full = join(dir, entry.name);
          if (entry.isDirectory()) await walk(full);
          else if (entry.isFile()) await searchFile(full);
        }
      };
      await walk(root);
    }

    if (results.length === 0) {
      return { content: `No matches for /${patternText}/ (${scanned} files scanned).` };
    }

    const footer = truncated ? `\n${c.dim(`… stopped at ${limit} matches. Narrow the search with include/max_results.`)}` : '';
    return { content: clampOutput(`${results.join('\n')}${footer}`) };
  },
};
