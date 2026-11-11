import { ParallaxError } from '../util/errors.js';
import { bashTool } from './bash.js';
import { editFileTool } from './edit.js';
import { grepTool } from './grep.js';
import { listFilesTool } from './list.js';
import { readFileTool } from './read.js';
import type { Tool } from './tool.js';
import { writeFileTool } from './write.js';

export const tools: Tool[] = [readFileTool, listFilesTool, grepTool, writeFileTool, editFileTool, bashTool];

const byName = new Map(tools.map((tool) => [tool.spec.name, tool]));

export function getTool(name: string): Tool {
  const tool = byName.get(name);
  if (!tool) {
    throw new ParallaxError(
      `Unknown tool "${name}".`,
      `Available tools: ${tools.map((entry) => entry.spec.name).join(', ')}.`,
    );
  }
  return tool;
}

export { Approvals } from './approvals.js';
export type { Tool, ToolContext, ToolResult } from './tool.js';
