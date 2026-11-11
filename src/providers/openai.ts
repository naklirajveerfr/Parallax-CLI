import OpenAI from 'openai';
import type {
  ContentBlock,
  Message,
  Provider,
  ProviderRequest,
  ProviderResponse,
  StopReason,
} from './types.js';
import { textBlocks, toolUses } from './types.js';

type ChatMessage = Record<string, unknown>;
type ChatTool = Record<string, unknown>;

function toOpenAIMessages(system: string, messages: Message[]): ChatMessage[] {
  const out: ChatMessage[] = [{ role: 'system', content: system }];

  for (const message of messages) {
    if (message.role === 'assistant') {
      const calls = toolUses(message.content).map((call) => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: JSON.stringify(call.input ?? {}) },
      }));
      out.push({
        role: 'assistant',
        content: textBlocks(message.content) || null,
        ...(calls.length > 0 ? { tool_calls: calls } : {}),
      });
      continue;
    }

    const results = message.content.filter((block) => block.type === 'tool_result');
    for (const result of results) {
      if (result.type !== 'tool_result') continue;
      out.push({ role: 'tool', tool_call_id: result.toolUseId, content: result.content });
    }
    const text = textBlocks(message.content);
    if (text.trim()) out.push({ role: 'user', content: text });
  }

  return out;
}

function toStopReason(finishReason: string | null, hasToolCalls: boolean): StopReason {
  if (hasToolCalls) return 'tool_use';
  if (finishReason === 'length') return 'max_tokens';
  return 'end_turn';
}

interface PendingCall {
  id: string;
  name: string;
  arguments: string;
}

export class OpenAIProvider implements Provider {
  readonly id = 'openai';
  readonly model: string;

  constructor(
    private readonly client: OpenAI,
    model: string,
  ) {
    this.model = model;
  }

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    const tools: ChatTool[] = request.tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));

    const stream = await this.client.chat.completions.create(
      {
        model: this.model,
        messages: toOpenAIMessages(request.system, request.messages) as never,
        ...(tools.length > 0 ? { tools: tools as never, tool_choice: 'auto' } : {}),
        stream: true,
        stream_options: { include_usage: true },
      },
      { signal: request.signal },
    );

    let text = '';
    let finishReason: string | null = null;
    let inputTokens = 0;
    let outputTokens = 0;
    const pending = new Map<number, PendingCall>();

    for await (const chunk of stream) {
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens ?? inputTokens;
        outputTokens = chunk.usage.completion_tokens ?? outputTokens;
      }

      const choice = chunk.choices?.[0];
      if (!choice) continue;
      if (choice.finish_reason) finishReason = choice.finish_reason;

      const delta = choice.delta;
      if (!delta) continue;

      if (delta.content) {
        text += delta.content;
        request.onText?.(delta.content);
      }

      for (const call of delta.tool_calls ?? []) {
        const index = call.index ?? 0;
        const slot = pending.get(index) ?? { id: '', name: '', arguments: '' };
        if (call.id) slot.id = call.id;
        if (call.function?.name) slot.name += call.function.name;
        if (call.function?.arguments) slot.arguments += call.function.arguments;
        pending.set(index, slot);
      }
    }

    const content: ContentBlock[] = [];
    if (text.trim()) content.push({ type: 'text', text });

    for (const [index, call] of pending) {
      if (!call.name) continue;
      let input: Record<string, unknown> = {};
      if (call.arguments.trim()) {
        try {
          input = JSON.parse(call.arguments) as Record<string, unknown>;
        } catch {
          input = { __parseError: call.arguments };
        }
      }
      content.push({
        type: 'tool_use',
        id: call.id || `call_${index}_${Date.now()}`,
        name: call.name,
        input,
      });
    }

    return {
      content,
      stopReason: toStopReason(finishReason, pending.size > 0),
      usage: { inputTokens, outputTokens },
    };
  }
}

export function createOpenAIProvider(options: {
  apiKey?: string;
  model: string;
  baseUrl?: string;
}): OpenAIProvider {
  const client = new OpenAI({
    // Local OpenAI-compatible servers (Ollama, LM Studio) ignore the key.
    apiKey: options.apiKey || 'not-needed',
    ...(options.baseUrl ? { baseURL: options.baseUrl } : {}),
  });
  return new OpenAIProvider(client, options.model);
}
