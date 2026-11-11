import { writeFile } from 'node:fs/promises';
import { c } from '../util/colors.js';
import { ParallaxError } from '../util/errors.js';
import { displayPath, readTextFile, requireInside, resolvePath } from './fsutil.js';
import { asBoolean, asString, type Tool } from './tool.js';

function previewLines(lines: string[], prefix: string, color: (text: string) => string, max = 12): string {
  const shown = lines.slice(0, max).map((line) => color(`${prefix} ${line}`));
  if (lines.length > max) shown.push(c.dim(`  … ${lines.length - max} more lines`));
  return shown.join('\n');
}

export const editFileTool: Tool = {
  spec: {
    name: 'edit_file',
    description:
      'Replace an exact string in a file. old_string must match the file byte-for-byte (including indentation). Fails if it is missing or ambiguous unless replace_all is true.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path, relative to the workspace.' },
        old_string: { type: 'string', description: 'Exact text to replace.' },
        new_string: { type: 'string', description: 'Replacement text.' },
        replace_all: { type: 'boolean', description: 'Replace every occurrence (default false).' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },

  async run(input, context) {
    const path = resolvePath(asString(input, 'path'), context.cwd);
    const oldString = asString(input, 'old_string');
    const newString = asString(input, 'new_string', '');
    const replaceAll = asBoolean(input, 'replace_all');
    if (!context.allowOutside) requireInside(path, context.cwd, 'edit');

    if (oldString === newString) {
      return { content: 'old_string and new_string are identical; nothing to do.', isError: true };
    }
    if (oldString === '') {
      throw new ParallaxError('old_string must not be empty. Use write_file to create files.');
    }

    const original = await readTextFile(path);
    const occurrences = original.split(oldString).length - 1;

    if (occurrences === 0) {
      return {
        content: `old_string was not found in ${displayPath(path, context.cwd)}. Read the file again and copy the exact text, including indentation.`,
        isError: true,
      };
    }
    if (occurrences > 1 && !replaceAll) {
      return {
        content: `old_string appears ${occurrences} times in ${displayPath(path, context.cwd)}. Add surrounding context to make it unique, or set replace_all.`,
        isError: true,
      };
    }

    const updated = replaceAll
      ? original.split(oldString).join(newString)
      : original.replace(oldString, newString);

    const label = displayPath(path, context.cwd);
    const body = [
      previewLines(oldString.split('\n'), '-', c.red, 10),
      previewLines(newString.split('\n'), '+', c.green, 10),
    ]
      .filter(Boolean)
      .join('\n');

    const approved = await context.approvals.request(
      'edit',
      `Edit ${label}${replaceAll ? ` (${occurrences} replacements)` : ''}`,
      body,
    );
    if (!approved) return { content: `User declined to edit ${label}.`, isError: true };

    await writeFile(path, updated, 'utf8');
    return {
      content: `Edited ${label}${replaceAll ? ` (${occurrences} replacements)` : ''}.`,
    };
  },
};
