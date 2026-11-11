import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AzureOpenAI } from 'openai';
import { ParallaxError } from '../util/errors.js';
import { OpenAIProvider } from './openai.js';
import type { Provider } from './types.js';

const run = promisify(execFile);

let cached: { token: string; expiresAt: number } | null = null;

async function azureCliToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  try {
    const { stdout } = await run(
      'az',
      [
        'account',
        'get-access-token',
        '--resource',
        'https://cognitiveservices.azure.com',
        '--query',
        'accessToken',
        '-o',
        'tsv',
      ],
      { timeout: 30_000 },
    );
    const token = stdout.trim();
    if (!token) throw new Error('empty token');
    cached = { token, expiresAt: Date.now() + 45 * 60_000 };
    return token;
  } catch (error) {
    throw new ParallaxError(
      'Azure authentication failed.',
      `Set AZURE_OPENAI_API_KEY, or sign in with the Azure CLI (\`az login\`) so Entra ID tokens can be fetched. ${(error as Error).message}`,
    );
  }
}

function azureEndpoint(): string | undefined {
  if (process.env.AZURE_OPENAI_ENDPOINT) return process.env.AZURE_OPENAI_ENDPOINT;
  const resource = process.env.AZURE_RESOURCE_NAME ?? process.env.AZURE_OPENAI_RESOURCE_NAME;
  return resource ? `https://${resource}.openai.azure.com` : undefined;
}

export function createAzureProvider(options: { apiKey?: string; model: string }): Provider {
  const endpoint = azureEndpoint();
  if (!endpoint) {
    throw new ParallaxError(
      'Azure OpenAI endpoint is not configured.',
      'Set AZURE_OPENAI_ENDPOINT, or AZURE_RESOURCE_NAME for a resource named https://<name>.openai.azure.com.',
    );
  }

  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT ?? options.model;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? '2024-10-21';

  const client = new AzureOpenAI({
    endpoint,
    deployment,
    apiVersion,
    ...(options.apiKey
      ? { apiKey: options.apiKey }
      : { azureADTokenProvider: () => azureCliToken() }),
  });

  return new OpenAIProvider(client, deployment);
}
