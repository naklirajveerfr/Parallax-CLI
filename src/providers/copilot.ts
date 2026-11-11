import OpenAI from 'openai';
import { ParallaxError } from '../util/errors.js';
import { OpenAIProvider } from './openai.js';
import type { Provider, ProviderRequest, ProviderResponse } from './types.js';

interface CopilotSession {
  token: string;
  api: string;
  expiresAt: number;
}

const sessions = new Map<string, CopilotSession>();

/**
 * GitHub Copilot has no documented public API. This exchanges a GitHub token
 * (from `gh auth token`, a PAT, or `GITHUB_TOKEN`) for a short-lived Copilot
 * token, the same way editor integrations do. It can break without notice.
 */
async function copilotSession(githubToken: string): Promise<CopilotSession> {
  const cached = sessions.get(githubToken);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached;

  const response = await fetch('https://api.github.com/copilot_internal/v2/token', {
    headers: {
      Authorization: `token ${githubToken}`,
      Accept: 'application/json',
      'User-Agent': 'ParallaxCLI',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    let message = detail.slice(0, 200);
    try {
      const parsed = JSON.parse(detail) as { message?: string };
      if (parsed.message) message = parsed.message;
    } catch {
      // Keep the raw text.
    }
    throw new ParallaxError(
      `GitHub Copilot sign-in failed (${response.status}): ${message}`,
      'Make sure the token belongs to an account with an active Copilot subscription. Try `gh auth token` for a fresh token.',
    );
  }

  const body = (await response.json()) as {
    token?: string;
    expires_at?: number;
    endpoints?: { api?: string };
  };

  if (!body.token) {
    throw new ParallaxError('GitHub returned no Copilot token.', 'Try `gh auth login` and retry.');
  }

  const session: CopilotSession = {
    token: body.token,
    api: body.endpoints?.api ?? 'https://api.githubcopilot.com',
    expiresAt: (body.expires_at ?? Math.floor(Date.now() / 1000) + 1500) * 1000,
  };
  sessions.set(githubToken, session);
  return session;
}

export class CopilotProvider implements Provider {
  readonly id = 'copilot';

  constructor(
    readonly model: string,
    private readonly githubToken: string,
  ) {}

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    const session = await copilotSession(this.githubToken);

    const client = new OpenAI({
      apiKey: session.token,
      baseURL: session.api,
      defaultHeaders: {
        'Copilot-Integration-Id': 'vscode-chat',
        'Editor-Version': 'vscode/1.99.0',
        'User-Agent': 'GitHubCopilotChat/0.26.7',
      },
    });

    return new OpenAIProvider(client, this.model).complete(request);
  }
}

export function createCopilotProvider(options: { model: string; githubToken: string }): Provider {
  return new CopilotProvider(options.model, options.githubToken);
}
