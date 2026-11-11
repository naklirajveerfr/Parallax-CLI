#!/usr/bin/env node
import { main } from './cli/main.js';

// Piping output into `head`, `less`, or a closed terminal raises EPIPE. That is
// a normal way to stop reading, not an error, so exit quietly.
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EPIPE') process.exit(0);
    throw error;
  });
}

main(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`✗ ${message}\n`);
  process.exitCode = 1;
});
