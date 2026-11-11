export class ParallaxError extends Error {
  constructor(
    message: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = 'ParallaxError';
  }
}

interface StatusError {
  status?: number;
  statusCode?: number;
  message?: string;
  error?: { message?: string };
}

export function describeError(error: unknown): { message: string; hint?: string } {
  if (error instanceof ParallaxError) {
    return { message: error.message, hint: error.hint };
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return { message: 'Request cancelled.' };
  }

  const statusError = error as StatusError;
  const status = statusError?.status ?? statusError?.statusCode;
  const detail =
    statusError?.error?.message || (error instanceof Error ? error.message : undefined) || String(error);

  switch (status) {
    case 401:
    case 403:
      return {
        message: `Authentication failed (${status}): ${detail}`,
        hint: 'Check your API key with `parallax config`, or run `parallax login` to store a new one.',
      };
    case 404:
      return {
        message: `Not found (404): ${detail}`,
        hint: 'The model or base URL may be wrong. Try `parallax config set model <name>`.',
      };
    case 429:
      return {
        message: `Rate limited (429): ${detail}`,
        hint: 'Wait a moment and retry, or switch models with /model.',
      };
    default:
      break;
  }

  if (status && status >= 500) {
    return { message: `Provider error (${status}): ${detail}`, hint: 'This is usually temporary. Retry in a few seconds.' };
  }

  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'EAI_AGAIN') {
    return {
      message: `Network error: ${detail}`,
      hint: 'Check your connection or the configured base URL (`parallax config`).',
    };
  }

  return { message: detail };
}
