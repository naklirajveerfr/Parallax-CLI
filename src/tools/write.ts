import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { c } from '../util/colors.js';
import { ParallaxError } from '../util/errors.js';
import { fileInfo, lineCount, displayPath, requireInside, resolvePath } from './fsutil.js';
import { asString, type Tool } from './tool.js';

export const writeFileTool: Tool = {
  spec: {
    name: 'write_file',
    description:
      'Create a new file or overwrite an existing one with the given content. Prefer edit_file for small changes to existing files.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path, relative to the workspace.' },
        content: { type: 'string', description: 'Full file content.' },
      },
      required: ['path', 'content'],
    },
  },

  async run(input, context) {
    const path = resolvePath(asString(input, 'path'), context.cwd);
    const content = asString(input, 'content', '');
    if (!context.allowOutside) requireInside(path, context.cwd, 'write');

    const existing = await fileInfo(path);
    if (existing?.isDirectory) throw new ParallaxError(`That is a directory: ${path}`);

    const label = displayPath(path, context.cwd);
    const lines = lineCount(content);
    const verb = existing ? 'Overwrite' : 'Create';

    const approved = await context.approvals.request(
      'write',
      `${verb} file ${label}`,
      existing
        ? `${c.dim(`${lines} lines, ${content.length} bytes`)} (replacing an existing ${existing.size}-byte file)`
        : `${c.dim(`${lines} lines, ${content.length} bytes`)}\n${content.split('\n').slice(0, 12).join('\n')}${
            lines > 12 ? '\n…' : ''
          }`,
    );
    if (!approved) return { content: `User declined to write ${label}.`, isError: true };

    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf8');
    return { content: `Wrote ${label} (${lines} lines, ${content.length} bytes).` };
  },
};
