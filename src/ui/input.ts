import { createInterface, type Interface } from 'node:readline';

/** Read one line from stdin without echoing (for API keys). */
export async function promptSecret(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin });
    try {
      for await (const line of rl) return line.trim();
      return '';
    } finally {
      rl.close();
    }
  }

  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);

    let value = '';
    const wasRaw = stdin.isRaw;

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const cleanup = () => {
      stdin.setRawMode(Boolean(wasRaw));
      stdin.pause();
      stdin.removeListener('data', onData);
    };

    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          cleanup();
          process.stdout.write('\n');
          resolve(value.trim());
          return;
        }
        if (char === '\u0003') {
          cleanup();
          process.stdout.write('\n');
          process.exit(130);
        }
        if (char === '\u007f' || char === '\b') {
          if (value) {
            value = value.slice(0, -1);
            process.stdout.write('\b \b');
          }
          continue;
        }
        if (char === '\u001b') continue;
        if (char >= ' ') {
          value += char;
          process.stdout.write('*');
        }
      }
    };

    stdin.on('data', onData);
  });
}

/** Ask a yes/no style question, reading a single line. */
export async function promptLine(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await new Promise<string>((resolve) => rl.question(question, resolve));
  } finally {
    rl.close();
  }
}

/**
 * Read a hidden value while a readline interface is open. readline's own input
 * listener would echo and interpret every keystroke, so detach it for the
 * duration of the prompt and put it back afterwards.
 */
export async function promptSecretDuring(rl: Interface, question: string): Promise<string> {
  const input = process.stdin;
  if (!input.isTTY) return promptSecret(question);

  const listeners = input.listeners('data') as Array<(chunk: Buffer) => void>;
  rl.pause();
  for (const listener of listeners) input.removeListener('data', listener);
  try {
    return await promptSecret(question);
  } finally {
    for (const listener of listeners) input.on('data', listener);
    rl.resume();
  }
}
