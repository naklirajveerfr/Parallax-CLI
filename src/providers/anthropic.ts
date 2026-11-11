import Anthropic from '@anthropic-ai/sdk';
import type {
  ContentBlock,
  Message,
  Provider,
  ProviderRequest,
  ProviderResponse,
  StopReason,
} from './types.js';

function toAnthropicMessages(messages: Message[]): Anthropic.MessageParam[] {
  const merged: { role: 'user' | 'assistant'; content: Anthropic.ContentBlockParam[] }[] = [];

  for (const message of messages) {
    const content: Anthropic.ContentBlockParam[] = [];
    for (const block of message.content) {
      switch (block.type) {
        case 'text':
          if (block.text.trim()) content.push({ type: 'text', text: block.text });
          break;
        case 'tool_use':
          content.push({
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: block.input,
          });
          break;
        case 'tool_result':
          content.push({
            type: 'tool_result',
            tool_use_id: block.toolUseId,
            content: block.content,
            is_error: block.isError ?? false,
          });
          break;
      }
    }
    if (content.length === 0) continue;

    const previous = merged[merged.length - 1];
    if (previous && previous.role === message.role) {
      previous.content.push(...content);
    } else {
      merged.push({ role: message.role, content });
    }
  }

  return merged as Anthropic.MessageParam[];
}

function toStopReason(reason: Anthropic.Message['stop_reason']): StopReason {
  switch (reason) {
    case 'tool_use':
      return 'tool_use';
    case 'max_tokens':
      return 'max_tokens';
    default:
      return 'end_turn';
  }
}

export class AnthropicProvider implements Provider {
  readonly id = 'anthropic';
  readonly model: string;

  constructor(
    private readonly client: Anthropic,
    model: string,
  ) {
    this.model = model;
  }

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    const stream = this.client.messages.stream(
      {
        model: this.model,
        max_tokens: request.maxTokens,
        system: request.system,
        messages: toAnthropicMessages(request.messages),
        tools: request.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
        })),
      },
      { signal: request.signal },
    );

    if (request.onText) {
      stream.on('text', (delta) => request.onText?.(delta));
    }

    const final = await stream.finalMessage();

    const content: ContentBlock[] = [];
    for (const block of final.content) {
      if (block.type === 'text') {
        content.push({ type: 'text', text: block.text });
      } else if (block.type === 'tool_use') {
        content.push({
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: (block.input ?? {}) as Record<string, unknown>,
        });
      }
    }

    return {
      content,
      stopReason: toStopReason(final.stop_reason),
      usage: {
        inputTokens: final.usage.input_tokens,
        outputTokens: final.usage.output_tokens,
      },
    };
  }
}

export function createAnthropicProvider(options: {
  apiKey: string;
  model: string;
  baseUrl?: string;
}): AnthropicProvider {
  const client = new Anthropic({
    apiKey: options.apiKey,
    ...(options.baseUrl ? { baseURL: options.baseUrl } : {}),
  });
  return new AnthropicProvider(client, options.model);
}
