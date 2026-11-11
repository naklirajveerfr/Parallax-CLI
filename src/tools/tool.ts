import type { ToolSpec } from '../providers/types.js';
import type { Approvals } from './approvals.js';

export interface ToolContext {
  cwd: string;
  approvals: Approvals;
  allowOutside: boolean;
  signal?: AbortSignal;
}

export interface ToolResult {
  content: string;
  isError?: boolean;
}

export interface Tool {
  spec: ToolSpec;
  run(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}

export const MAX_TOOL_OUTPUT = 30_000;

export function clampOutput(text: string, limit = MAX_TOOL_OUTPUT): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n\n… output truncated (${text.length - limit} characters omitted). Narrow the command if you need the rest.`;
}

export function asString(input: Record<string, unknown>, key: string, fallback?: string): string {
  const value = input[key];
  if (typeof value === 'string') return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required string argument "${key}".`);
}

export function asNumber(input: Record<string, unknown>, key: string, fallback?: number): number | undefined {
  const value = input[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

export function asBoolean(input: Record<string, unknown>, key: string, fallback = false): boolean {
  const value = input[key];
  return typeof value === 'boolean' ? value : fallback;
}
