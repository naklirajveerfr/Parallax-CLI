import { c } from '../util/colors.js';
import { displayPath, readTextFile, resolvePath, withLineNumbers } from './fsutil.js';
import { asNumber, asString, clampOutput, type Tool } from './tool.js';

export const readFileTool: Tool = {
  spec: {
    name: 'read_file',
    description:
      'Read a text file from the workspace. Returns line-numbered content. Use offset/limit for large files.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path, relative to the workspace or absolute.' },
        offset: { type: 'number', description: '1-based line to start at (default 1).' },
        limit: { type: 'number', description: 'Maximum number of lines to return (default 2000).' },
      },
      required: ['path'],
    },
  },

  async run(input, context) {
    const path = resolvePath(asString(input, 'path'), context.cwd);
    const offset = Math.max(1, Math.floor(asNumber(input, 'offset', 1) ?? 1));
    const limit = Math.max(1, Math.floor(asNumber(input, 'limit', 2000) ?? 2000));

    const text = await readTextFile(path);
    const lines = text.split('\n');
    const slice = lines.slice(offset - 1, offset - 1 + limit);
    const shown = withLineNumbers(slice.join('\n'), offset);
    const header = `${c.dim(displayPath(path, context.cwd))} ${c.dim(`(${lines.length} lines)`)}`;
    const footer =
      offset - 1 + slice.length < lines.length
        ? `\n${c.dim(`… ${lines.length - (offset - 1 + slice.length)} more lines. Read again with offset=${offset + slice.length}.`)}`
        : '';

    return { content: clampOutput(`${header}\n${shown}${footer}`) };
  },
};
