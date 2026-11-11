import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import OpenAI from 'openai';
import { ParallaxError } from '../util/errors.js';
import { OpenAIProvider } from './openai.js';
import type { Provider, ProviderRequest, ProviderResponse } from './types.js';

const run = promisify(execFile);

let cached: { token: string; expiresAt: number } | null = null;

async function vertexToken(): Promise<string> {
  const explicit =
    process.env.GOOGLE_VERTEX_ACCESS_TOKEN ??
    process.env.VERTEX_ACCESS_TOKEN ??
    process.env.GOOGLE_ACCESS_TOKEN;
  if (explicit) return explicit;

  if (cached && cached.expiresAt > Date.now()) return cached.token;

  try {
    const { stdout } = await run('gcloud', ['auth', 'print-access-token'], { timeout: 30_000 });
    const token = stdout.trim();
    if (!token) throw new Error('empty token');
    cached = { token, expiresAt: Date.now() + 45 * 60_000 };
    return token;
  } catch (error) {
    throw new ParallaxError(
      'No Google Cloud credentials found for Vertex AI.',
      `Run \`gcloud auth application-default login\`, set GOOGLE_VERTEX_ACCESS_TOKEN, or point GOOGLE_APPLICATION_CREDENTIALS at a service account. ${(error as Error).message}`,
    );
  }
}

function vertexConfig(): { project: string; location: string } {
  const project =
    process.env.GOOGLE_VERTEX_PROJECT ??
    process.env.VERTEXAI_PROJECT ??
    process.env.GOOGLE_CLOUD_PROJECT;
  const location =
    process.env.GOOGLE_VERTEX_LOCATION ??
    process.env.VERTEXAI_LOCATION ??
    process.env.GOOGLE_CLOUD_LOCATION ??
    'us-central1';

  if (!project) {
    throw new ParallaxError(
      'Vertex AI project is not configured.',
      'Set GOOGLE_VERTEX_PROJECT (or GOOGLE_CLOUD_PROJECT) and optionally GOOGLE_VERTEX_LOCATION.',
    );
  }

  return { project, location };
}

/**
 * Vertex AI exposes an OpenAI-compatible endpoint. Credentials are refreshed per
 * request, so long sessions keep working past the token lifetime.
 */
export class VertexProvider implements Provider {
  readonly id = 'vertex';

  constructor(readonly model: string) {}

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    const { project, location } = vertexConfig();
    const token = await vertexToken();
    const baseURL = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/endpoints/openapi`;

    const client = new OpenAI({ apiKey: token, baseURL });
    return new OpenAIProvider(client, this.model).complete(request);
  }
}

export function createVertexProvider(model: string): Provider {
  return new VertexProvider(model);
}
