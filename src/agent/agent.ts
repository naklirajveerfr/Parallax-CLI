import type { ContentBlock, Message, Provider, ToolResultBlock } from '../providers/types.js';
import { toolUses } from '../providers/types.js';
import { getTool, tools, type ToolContext } from '../tools/index.js';
import type { Renderer } from '../ui/render.js';
import { stripAnsi } from '../util/colors.js';
import { describeError } from '../util/errors.js';

export interface RunTurnOptions {
  provider: Provider;
  system: string;
  messages: Message[];
  context: ToolContext;
  render: Renderer;
  maxSteps?: number;
  maxTokens?: number;
}

export interface TurnUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface TurnResult {
  messages: Message[];
  usage: TurnUsage;
  steps: number;
  elapsedMs: number;
}

export async function runTurn(options: RunTurnOptions): Promise<TurnResult> {
  const { provider, context, render } = options;
  const messages = [...options.messages];
  const maxSteps = options.maxSteps ?? 40;
  const usage: TurnUsage = { inputTokens: 0, outputTokens: 0 };
  const startedAt = Date.now();
  let steps = 0;

  while (steps < maxSteps) {
    if (context.signal?.aborted) break;
    steps += 1;

    render.startThinking(steps === 1 ? 'thinking' : 'working');

    let response;
    try {
      response = await provider.complete({
        system: options.system,
        messages,
        tools: tools.map((tool) => tool.spec),
        maxTokens: options.maxTokens ?? 8192,
        signal: context.signal,
        onText: (chunk) => render.text(chunk),
      });
    } catch (error) {
      render.stopThinking();
      throw error;
    }

    render.endText();

    if (response.usage) {
      usage.inputTokens += response.usage.inputTokens;
      usage.outputTokens += response.usage.outputTokens;
    }

    messages.push({ role: 'assistant', content: response.content });

    if (response.stopReason !== 'tool_use') {
      if (response.stopReason === 'max_tokens') {
        render.warn('Response hit the output token limit. Ask to continue if it was cut off.');
      }
      break;
    }

    const calls = toolUses(response.content);
    if (calls.length === 0) break;

    const results: ContentBlock[] = [];
    for (const call of calls) {
      if (context.signal?.aborted) break;

      const callStarted = Date.now();
      render.toolCall(call.name, call.input);

      let block: ToolResultBlock;
      try {
        const tool = getTool(call.name);
        const result = await tool.run(call.input, context);
        render.toolResult(!result.isError, result.content, Date.now() - callStarted);
        block = {
          type: 'tool_result',
          toolUseId: call.id,
          content: stripAnsi(result.content),
          isError: result.isError,
        };
      } catch (error) {
        const described = describeError(error);
        const text = described.hint ? `${described.message}\n${described.hint}` : described.message;
        render.toolResult(false, text, Date.now() - callStarted);
        block = { type: 'tool_result', toolUseId: call.id, content: text, isError: true };
      }
      results.push(block);
    }

    messages.push({ role: 'user', content: results });

    if (context.signal?.aborted) break;

    if (steps >= maxSteps) {
      render.warn(`Stopped after ${maxSteps} steps to avoid a loop. Send another message to continue.`);
    }
  }

  const elapsedMs = Date.now() - startedAt;
  render.usage(usage.inputTokens, usage.outputTokens, elapsedMs);

  return { messages, usage, steps, elapsedMs };
}
