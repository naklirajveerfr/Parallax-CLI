import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { c } from '../util/colors.js';
import { displayPath, globToRegExp, IGNORED_DIRS, resolvePath } from './fsutil.js';
import { asNumber, asString, clampOutput, type Tool } from './tool.js';

const MAX_RESULTS = 400;

export const listFilesTool: Tool = {
  spec: {
    name: 'list_files',
    description:
      'List files in the workspace matching a glob pattern (e.g. "*.ts", "src/**/*.ts", "*"). Skips node_modules, .git, and build output.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern. Defaults to "*".' },
        path: { type: 'string', description: 'Directory to search in. Defaults to the workspace root.' },
        limit: { type: 'number', description: `Maximum entries to return (default ${MAX_RESULTS}).` },
      },
    },
  },

  async run(input, context) {
    const pattern = asString(input, 'pattern', '*');
    const root = resolvePath(asString(input, 'path', '.'), context.cwd);
    const limit = Math.max(1, Math.floor(asNumber(input, 'limit', MAX_RESULTS) ?? MAX_RESULTS));

    const matcher = globToRegExp(pattern.replace(/^\.\//, ''));
    const matches: string[] = [];
    let truncated = false;

    async function walk(dir: string): Promise<void> {
      if (matches.length >= limit) {
        truncated = true;
        return;
      }
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      entries.sort((a, b) => a.name.localeCompare(b.name));

      for (const entry of entries) {
        if (matches.length >= limit) {
          truncated = true;
          return;
        }
        if (IGNORED_DIRS.has(entry.name)) continue;

        const full = join(dir, entry.name);
        const rel = displayPath(full, context.cwd);

        if (entry.isDirectory()) {
          if (matcher.test(`${rel}/`) || matcher.test(rel)) matches.push(`${rel}/`);
          await walk(full);
        } else if (matcher.test(rel) || matcher.test(entry.name)) {
          matches.push(rel);
        }
      }
    }

    await walk(root);

    if (matches.length === 0) {
      return { content: `No files matched ${pattern} in ${displayPath(root, context.cwd)}.` };
    }

    const body = matches.join('\n');
    const footer = truncated ? `\n${c.dim(`… stopped at ${limit} entries. Use a narrower pattern.`)}` : '';
    return { content: clampOutput(`${c.dim(`${matches.length} match(es):`)}\n${body}${footer}`) };
  },
};
