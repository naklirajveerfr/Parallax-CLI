import type { ContentBlock, Provider, ProviderRequest, ProviderResponse } from './types.js';

/**
 * Offline provider used for demos and tests. It performs one `list_files`
 * call, then answers with a canned summary of the result.
 */
export class MockProvider implements Provider {
  readonly id = 'mock';
  readonly model = 'mock-1';

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    const last = request.messages[request.messages.length - 1];
    const lastToolResult = last?.content.find((block) => block.type === 'tool_result');

    if (lastToolResult && lastToolResult.type === 'tool_result') {
      const text = `I inspected the workspace. The \`list_files\` tool returned:\n\n\`\`\`\n${lastToolResult.content.slice(0, 800)}\n\`\`\`\n\nThis is the offline mock provider. Configure a real key with \`parallax login\` to chat with a model.`;
      await streamText(text, request.onText);
      return {
        content: [{ type: 'text', text }],
        stopReason: 'end_turn',
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    }

    const text = 'Let me take a look at the workspace first.';
    await streamText(text, request.onText);

    const content: ContentBlock[] = [
      { type: 'text', text },
      {
        type: 'tool_use',
        id: `mock_${Date.now()}`,
        name: 'list_files',
        input: { pattern: '*' },
      },
    ];

    return {
      content,
      stopReason: 'tool_use',
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }
}

async function streamText(text: string, onText?: (chunk: string) => void): Promise<void> {
  if (!onText) return;
  for (const word of text.split(/(\s+)/)) {
    onText(word);
    await new Promise((resolve) => setTimeout(resolve, 12));
  }
}

export function createMockProvider(): MockProvider {
  return new MockProvider();
}
