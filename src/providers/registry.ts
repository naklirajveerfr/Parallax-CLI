/**
 * Provider presets.
 *
 * Most services expose an OpenAI-compatible chat completions API, so they only
 * need a base URL, an env var for the key, and a default model. Providers with a
 * different wire protocol or auth flow get their own `kind` and adapter.
 *
 * Model ids are defaults only; users can override with `--model` or `/model`.
 */
export type ProviderKind =
  | 'anthropic'
  | 'openai'
  | 'azure'
  | 'vertex'
  | 'copilot'
  | 'mock'
  | 'unsupported';

export type AuthKind = 'api-key' | 'none' | 'custom';

export interface ProviderPreset {
  id: string;
  label: string;
  kind: ProviderKind;
  /** Base URL. May contain `${ENV_VAR}` placeholders. */
  baseUrl?: string;
  defaultModel: string;
  /** Key env vars, in priority order. */
  envKeys: string[];
  /** Extra env vars without which the provider cannot be used. */
  requiredEnv?: string[];
  auth: AuthKind;
  /** Short note shown in `parallax providers` and in error hints. */
  notes?: string;
  /** Experimental: may rely on a non-public API. */
  experimental?: boolean;
}

export const PRESETS: ProviderPreset[] = [
  // First-party APIs
  {
    id: 'anthropic',
    label: 'Anthropic',
    kind: 'anthropic',
    defaultModel: 'claude-sonnet-5-5',
    envKeys: ['ANTHROPIC_API_KEY'],
    auth: 'api-key',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    kind: 'openai',
    defaultModel: 'gpt-6.1-terra',
    envKeys: ['OPENAI_API_KEY'],
    auth: 'api-key',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    kind: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'anthropic/claude-sonnet-5.5',
    envKeys: ['OPENROUTER_API_KEY'],
    auth: 'api-key',
    notes: 'One key for hundreds of models. Model ids are vendor-prefixed.',
  },

  // Frontier labs
  {
    id: 'google',
    label: 'Google Gemini',
    kind: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-4-carbon',
    envKeys: ['GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GOOGLE_API_KEY'],
    auth: 'api-key',
    notes: 'Uses Google’s OpenAI-compatibility endpoint.',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    kind: 'openai',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-v4-pro',
    envKeys: ['DEEPSEEK_API_KEY'],
    auth: 'api-key',
  },
  {
    id: 'xai',
    label: 'xAI (Grok)',
    kind: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-4.7',
    envKeys: ['XAI_API_KEY'],
    auth: 'api-key',
  },
  {
    id: 'moonshot',
    label: 'Moonshot AI (Kimi)',
    kind: 'openai',
    baseUrl: 'https://api.moonshot.ai/v1',
    defaultModel: 'kimi-k3.1-pro',
    envKeys: ['MOONSHOT_API_KEY'],
    auth: 'api-key',
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    kind: 'openai',
    baseUrl: 'https://api.minimax.io/v1',
    defaultModel: 'MiniMax-M3',
    envKeys: ['MINIMAX_API_KEY'],
    auth: 'api-key',
  },
  {
    id: 'zai',
    label: 'Z.AI (GLM)',
    kind: 'openai',
    baseUrl: 'https://api.z.ai/api/paas/v4',
    defaultModel: 'glm-5.3',
    envKeys: ['ZAI_API_KEY', 'ZHIPU_API_KEY'],
    auth: 'api-key',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    kind: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-large-4',
    envKeys: ['MISTRAL_API_KEY'],
    auth: 'api-key',
  },
  {
    id: 'cohere',
    label: 'Cohere',
    kind: 'openai',
    baseUrl: 'https://api.cohere.ai/compatibility/v1',
    defaultModel: 'command-a-plus-05-2026',
    envKeys: ['COHERE_API_KEY'],
    auth: 'api-key',
    notes: 'Uses Cohere’s OpenAI-compatibility endpoint.',
  },
  {
    id: 'ai21',
    label: 'AI21 Labs',
    kind: 'openai',
    baseUrl: 'https://api.ai21.com/studio/v1',
    defaultModel: 'jamba-large',
    envKeys: ['AI21_API_KEY'],
    auth: 'api-key',
  },

  // Fast inference hosts and GPU clouds
  {
    id: 'groq',
    label: 'Groq',
    kind: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'qwen/qwen3.8-27b',
    envKeys: ['GROQ_API_KEY'],
    auth: 'api-key',
  },
  {
    id: 'cerebras',
    label: 'Cerebras',
    kind: 'openai',
    baseUrl: 'https://api.cerebras.ai/v1',
    defaultModel: 'qwen-3.8-27b',
    envKeys: ['CEREBRAS_API_KEY'],
    auth: 'api-key',
  },
  {
    id: 'fireworks',
    label: 'Fireworks AI',
    kind: 'openai',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    defaultModel: 'accounts/fireworks/models/kimi-k3p1-pro',
    envKeys: ['FIREWORKS_API_KEY'],
    auth: 'api-key',
  },
  {
    id: 'together',
    label: 'Together AI',
    kind: 'openai',
    baseUrl: 'https://api.together.xyz/v1',
    defaultModel: 'moonshotai/Kimi-K3.1-Pro',
    envKeys: ['TOGETHER_API_KEY'],
    auth: 'api-key',
  },
  {
    id: 'deepinfra',
    label: 'Deep Infra',
    kind: 'openai',
    baseUrl: 'https://api.deepinfra.com/v1/openai',
    defaultModel: 'moonshotai/Kimi-K3.1-Pro',
    envKeys: ['DEEPINFRA_API_KEY'],
    auth: 'api-key',
  },
  {
    id: 'baseten',
    label: 'Baseten',
    kind: 'openai',
    baseUrl: 'https://inference.baseten.co/v1',
    defaultModel: 'moonshotai/Kimi-K3.1-Pro',
    envKeys: ['BASETEN_API_KEY'],
    auth: 'api-key',
  },
  {
    id: 'nvidia',
    label: 'NVIDIA NIM',
    kind: 'openai',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    defaultModel: 'deepseek-ai/deepseek-v4.1-flash',
    envKeys: ['NVIDIA_API_KEY'],
    auth: 'api-key',
  },
  {
    id: 'huggingface',
    label: 'Hugging Face',
    kind: 'openai',
    baseUrl: 'https://router.huggingface.co/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V4.1-Flash-1017',
    envKeys: ['HF_TOKEN'],
    auth: 'api-key',
    notes: 'Uses the Hugging Face Inference Providers router.',
  },
  {
    id: 'nebius',
    label: 'Nebius Token Factory',
    kind: 'openai',
    baseUrl: 'https://api.tokenfactory.nebius.com/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V4.1-Flash-1017',
    envKeys: ['NEBIUS_API_KEY'],
    auth: 'api-key',
  },

  // Enterprise clouds
  {
    id: 'azure',
    label: 'Azure OpenAI',
    kind: 'azure',
    defaultModel: 'gpt-6.1-terra',
    envKeys: ['AZURE_OPENAI_API_KEY', 'AZURE_API_KEY'],
    requiredEnv: [],
    auth: 'api-key',
    notes: 'Needs AZURE_RESOURCE_NAME (or AZURE_OPENAI_ENDPOINT); deployment defaults to the model.',
  },
  {
    id: 'vertex',
    label: 'Google Vertex AI',
    kind: 'vertex',
    defaultModel: 'gemini-4-carbon',
    envKeys: [],
    requiredEnv: [],
    auth: 'custom',
    notes: 'Needs GOOGLE_VERTEX_PROJECT and credentials (gcloud ADC or GOOGLE_VERTEX_ACCESS_TOKEN).',
  },
  {
    id: 'cloudflare',
    label: 'Cloudflare Workers AI',
    kind: 'openai',
    baseUrl: 'https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/v1',
    defaultModel: '@cf/deepseek-ai/deepseek-v4.1-flash-1017',
    envKeys: ['CLOUDFLARE_API_KEY', 'CLOUDFLARE_API_TOKEN'],
    requiredEnv: ['CLOUDFLARE_ACCOUNT_ID'],
    auth: 'api-key',
  },
  {
    id: 'cloudflare-gateway',
    label: 'Cloudflare AI Gateway',
    kind: 'openai',
    baseUrl: 'https://gateway.ai.cloudflare.com/v1/${CLOUDFLARE_ACCOUNT_ID}/${CLOUDFLARE_GATEWAY_ID}/compat',
    defaultModel: 'openai/gpt-6.1-terra',
    envKeys: ['CLOUDFLARE_API_TOKEN'],
    requiredEnv: ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_GATEWAY_ID'],
    auth: 'api-key',
    experimental: true,
    notes: 'Universal /compat endpoint; model ids are provider-prefixed.',
  },
  {
    id: 'digitalocean',
    label: 'DigitalOcean',
    kind: 'openai',
    baseUrl: 'https://inference.do-ai.run/v1',
    defaultModel: 'deepseek-v4.1-flash-1017',
    envKeys: ['DIGITALOCEAN_ACCESS_TOKEN', 'DIGITALOCEAN_MODEL_ACCESS_KEY'],
    auth: 'api-key',
  },
  {
    id: 'snowflake',
    label: 'Snowflake Cortex',
    kind: 'openai',
    baseUrl: 'https://${SNOWFLAKE_ACCOUNT}.snowflakecomputing.com/api/v2/cortex/v1',
    defaultModel: 'claude-sonnet-5',
    envKeys: ['SNOWFLAKE_CORTEX_PAT'],
    requiredEnv: ['SNOWFLAKE_ACCOUNT'],
    auth: 'api-key',
    experimental: true,
    notes: 'Uses the Cortex OpenAI-compatible endpoint; set SNOWFLAKE_ACCOUNT to your account identifier.',
  },
  {
    id: 'oci',
    label: 'OCI Generative AI',
    kind: 'openai',
    baseUrl: 'https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/openai/v1',
    defaultModel: 'xai.grok-4.6',
    envKeys: ['OCI_GENAI_API_KEY'],
    auth: 'api-key',
    experimental: true,
    notes: 'Uses OCI’s OpenAI-compatible endpoint; the default region is us-chicago-1.',
  },
  {
    id: 'copilot',
    label: 'GitHub Copilot',
    kind: 'copilot',
    baseUrl: 'https://api.githubcopilot.com',
    defaultModel: 'gpt-6.1-terra',
    envKeys: ['GITHUB_TOKEN', 'GH_TOKEN'],
    auth: 'api-key',
    experimental: true,
    notes: 'Exchanges a GitHub token for a Copilot token. Unofficial endpoint; may break.',
  },
  {
    id: 'bedrock',
    label: 'Amazon Bedrock',
    kind: 'unsupported',
    defaultModel: '',
    envKeys: [],
    auth: 'custom',
    notes:
      'Needs AWS SigV4/Converse protocol support, which is not implemented. Use --provider openai with a Bedrock-compatible proxy for now.',
  },
  {
    id: 'sap',
    label: 'SAP AI Core',
    kind: 'unsupported',
    defaultModel: '',
    envKeys: [],
    auth: 'custom',
    notes:
      'Requires an OAuth client-credentials exchange and a per-deployment URL. Not implemented yet.',
  },
  {
    id: 'gitlab',
    label: 'GitLab Duo',
    kind: 'unsupported',
    defaultModel: '',
    envKeys: [],
    auth: 'custom',
    notes:
      'GitLab Duo uses its own chat API rather than an OpenAI-compatible endpoint. Not implemented yet.',
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT Plus/Pro',
    kind: 'unsupported',
    defaultModel: '',
    envKeys: [],
    auth: 'custom',
    notes:
      'ChatGPT subscriptions have no public API. Use --provider openai with an API key, or --provider copilot.',
  },

  // Local
  {
    id: 'ollama',
    label: 'Ollama (local)',
    kind: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.1',
    envKeys: [],
    auth: 'none',
    notes: 'Run `ollama serve` and pull a model first.',
  },
  {
    id: 'lmstudio',
    label: 'LM Studio (local)',
    kind: 'openai',
    baseUrl: 'http://127.0.0.1:1234/v1',
    defaultModel: 'openai/gpt-oss-20b',
    envKeys: [],
    auth: 'none',
    notes: 'Start the LM Studio local server first.',
  },
  {
    id: 'mock',
    label: 'Mock (offline demo)',
    kind: 'mock',
    defaultModel: 'mock-1',
    envKeys: [],
    auth: 'none',
  },
];

const byId = new Map(PRESETS.map((preset) => [preset.id, preset]));

export const PROVIDER_IDS: string[] = PRESETS.map((preset) => preset.id);

export function getPreset(id: string): ProviderPreset | undefined {
  return byId.get(id);
}

export function isAvailable(preset: ProviderPreset): boolean {
  return preset.kind !== 'unsupported';
}

export function canLogin(preset: ProviderPreset): boolean {
  return isAvailable(preset) && preset.kind !== 'mock' && preset.auth !== 'none';
}
