import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parseArgs } from '../dist/cli/args.js';
import { defaultConfig, resolveBaseUrl, resolveModel } from '../dist/config.js';
import { createProvider, interpolateBaseUrl, PRESETS, resolveProviderSettings } from '../dist/providers/index.js';
import { MockProvider } from '../dist/providers/mock.js';
import { runTurn } from '../dist/agent/agent.js';
import { Approvals, tools } from '../dist/tools/index.js';
import { globToRegExp } from '../dist/tools/fsutil.js';
import { Renderer } from '../dist/ui/render.js';

const getTool = (name) => {
  const tool = tools.find((entry) => entry.spec.name === name);
  assert.ok(tool, `tool ${name} exists`);
  return tool;
};

async function workspace() {
  const cwd = await mkdtemp(join(tmpdir(), 'parallax-test-'));
  return { cwd, context: { cwd, approvals: new Approvals('yes'), allowOutside: false } };
}

test('parseArgs handles subcommands, flags, and prompts', () => {
  assert.equal(parseArgs([]).command, 'chat');
  assert.equal(parseArgs(['login']).command, 'login');
  assert.equal(parseArgs(['config', 'set', 'model', 'x']).configArgs.join(' '), 'set model x');

  const oneShot = parseArgs(['--provider', 'openai', '-p', 'hello there', '--yes']);
  assert.equal(oneShot.provider, 'openai');
  assert.equal(oneShot.prompt, 'hello there');
  assert.equal(oneShot.yes, true);

  assert.equal(parseArgs(['explain', 'this', 'repo']).prompt, 'explain this repo');
  assert.throws(() => parseArgs(['--nope']), /Unknown option/);
});

test('globToRegExp matches nested patterns', () => {
  assert.equal(globToRegExp('*.ts').test('index.ts'), true);
  assert.equal(globToRegExp('*.ts').test('src/index.ts'), false);
  assert.equal(globToRegExp('**/*.ts').test('src/deep/index.ts'), true);
  assert.equal(globToRegExp('**/*.ts').test('index.ts'), true);
});

test('write, read, and edit files', async () => {
  const { cwd, context } = await workspace();

  const written = await getTool('write_file').run({ path: 'notes.txt', content: 'alpha\nbeta\n' }, context);
  assert.equal(written.isError, undefined);
  assert.equal(await readFile(join(cwd, 'notes.txt'), 'utf8'), 'alpha\nbeta\n');

  const read = await getTool('read_file').run({ path: 'notes.txt' }, context);
  assert.match(read.content, /1\| alpha/);
  assert.match(read.content, /2\| beta/);

  const edited = await getTool('edit_file').run(
    { path: 'notes.txt', old_string: 'beta', new_string: 'BETA' },
    context,
  );
  assert.equal(edited.isError, undefined);
  assert.equal(await readFile(join(cwd, 'notes.txt'), 'utf8'), 'alpha\nBETA\n');

  const missing = await getTool('edit_file').run(
    { path: 'notes.txt', old_string: 'nope', new_string: 'x' },
    context,
  );
  assert.equal(missing.isError, true);
});

test('edit refuses ambiguous matches unless replace_all is set', async () => {
  const { cwd, context } = await workspace();
  await getTool('write_file').run({ path: 'dup.txt', content: 'x\nx\n' }, context);

  const ambiguous = await getTool('edit_file').run({ path: 'dup.txt', old_string: 'x', new_string: 'y' }, context);
  assert.equal(ambiguous.isError, true);
  assert.match(ambiguous.content, /appears 2 times/);

  await getTool('edit_file').run(
    { path: 'dup.txt', old_string: 'x', new_string: 'y', replace_all: true },
    context,
  );
  assert.equal(await readFile(join(cwd, 'dup.txt'), 'utf8'), 'y\ny\n');
});

test('write_file refuses to escape the workspace', async () => {
  const { context } = await workspace();
  await assert.rejects(
    getTool('write_file').run({ path: '../escape.txt', content: 'no' }, context),
    /outside the workspace/,
  );
});

test('approvals can block destructive actions', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'parallax-deny-'));
  const context = { cwd, approvals: new Approvals('no'), allowOutside: false };
  const result = await getTool('write_file').run({ path: 'blocked.txt', content: 'no' }, context);
  assert.equal(result.isError, true);
  await assert.rejects(readFile(join(cwd, 'blocked.txt')));
});

test('grep and list_files find project files', async () => {
  const { cwd, context } = await workspace();
  await getTool('write_file').run({ path: 'src/a.ts', content: 'export const needle = 1;\n' }, context);
  await getTool('write_file').run({ path: 'README.md', content: '# docs\n' }, context);

  const found = await getTool('grep').run({ pattern: 'needle', include: '*.ts' }, context);
  assert.match(found.content, /src\/a\.ts:1:/);

  const listed = await getTool('list_files').run({ pattern: '**/*.ts' }, context);
  assert.match(listed.content, /src\/a\.ts/);
  assert.doesNotMatch(listed.content, /README\.md/);
  assert.equal(cwd.length > 0, true);
});

test('bash runs in the workspace and reports exit codes', async () => {
  const { cwd, context } = await workspace();
  const ok = await getTool('bash').run({ command: 'pwd' }, context);
  assert.match(ok.content, new RegExp(cwd.split('/').pop()));
  assert.match(ok.content, /Exit code: 0/);

  const failed = await getTool('bash').run({ command: 'exit 7' }, context);
  assert.equal(failed.isError, true);
  assert.match(failed.content, /Exit code: 7/);
});

test('openrouter is a first-class provider', () => {
  const config = defaultConfig();
  assert.equal(resolveModel(config, 'openrouter'), 'anthropic/claude-sonnet-5.5');
  assert.equal(resolveBaseUrl(config, 'openrouter'), 'https://openrouter.ai/api/v1');

  const settings = resolveProviderSettings(config, { provider: 'openrouter', apiKey: 'sk-or-test' });
  assert.equal(settings.provider, 'openrouter');
  assert.equal(settings.model, 'anthropic/claude-sonnet-5.5');
  assert.equal(settings.baseUrl, 'https://openrouter.ai/api/v1');
  assert.equal(settings.apiKey, 'sk-or-test');
});

test('registry presets are unique and well formed', () => {
  const ids = new Set();
  for (const preset of PRESETS) {
    assert.equal(ids.has(preset.id), false, `duplicate id ${preset.id}`);
    ids.add(preset.id);
    assert.ok(preset.label.length > 0, `${preset.id} has a label`);
    if (preset.kind === 'unsupported') continue;
    assert.ok(preset.defaultModel.length > 0, `${preset.id} has a default model`);
    if (preset.kind === 'openai' && preset.id !== 'openai') {
      assert.ok(preset.baseUrl, `${preset.id} needs a base URL`);
    }
  }
  assert.ok(ids.has('anthropic') && ids.has('groq') && ids.has('bedrock'));
});

test('openai-compatible presets resolve their endpoints', () => {
  const config = defaultConfig();
  const cases = [
    ['deepseek', 'https://api.deepseek.com'],
    ['groq', 'https://api.groq.com/openai/v1'],
    ['moonshot', 'https://api.moonshot.ai/v1'],
    ['google', 'https://generativelanguage.googleapis.com/v1beta/openai'],
    ['together', 'https://api.together.xyz/v1'],
  ];
  for (const [id, expected] of cases) {
    const settings = resolveProviderSettings(config, { provider: id, apiKey: 'test' });
    assert.equal(settings.baseUrl, expected, `${id} base URL`);
    assert.ok(settings.model.length > 0, `${id} model`);
  }
});

test('templated base URLs expand env vars or fail clearly', () => {
  const config = defaultConfig();
  const previous = process.env.SNOWFLAKE_ACCOUNT;
  try {
    delete process.env.SNOWFLAKE_ACCOUNT;
    const settings = resolveProviderSettings(config, { provider: 'snowflake', apiKey: 'test' });
    assert.throws(() => createProvider(settings), /Missing environment variable SNOWFLAKE_ACCOUNT/);

    process.env.SNOWFLAKE_ACCOUNT = 'acme';
    assert.equal(
      interpolateBaseUrl(resolveBaseUrl(config, 'snowflake')),
      'https://acme.snowflakecomputing.com/api/v2/cortex/v1',
    );
  } finally {
    if (previous === undefined) delete process.env.SNOWFLAKE_ACCOUNT;
    else process.env.SNOWFLAKE_ACCOUNT = previous;
  }
});

test('unsupported providers explain what is missing', () => {
  const config = defaultConfig();
  for (const id of ['bedrock', 'sap', 'gitlab', 'chatgpt']) {
    const settings = resolveProviderSettings(config, { provider: id });
    assert.throws(() => createProvider(settings), /not supported yet/);
  }
});

test('openrouter key can come from OPENROUTER_API_KEY and is required', () => {
  const previous = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'sk-or-env';
  try {
    const settings = resolveProviderSettings(defaultConfig(), { provider: 'openrouter' });
    assert.equal(settings.apiKey, 'sk-or-env');
    assert.doesNotThrow(() => createProvider(settings));
  } finally {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
  }
});

test('agent loop executes tools and returns a final answer', async () => {
  const { cwd } = await workspace();
  const render = new Renderer();
  const result = await runTurn({
    provider: new MockProvider(),
    system: 'test system',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'look around' }] }],
    render,
    context: { cwd, approvals: new Approvals('yes'), allowOutside: false },
  });

  assert.equal(result.steps, 2);
  const last = result.messages.at(-1);
  assert.equal(last.role, 'assistant');
  assert.match(JSON.stringify(last.content), /list_files/);
});

test('a closed stdout (EPIPE) exits quietly instead of crashing', async () => {
  const entry = fileURLToPath(new URL('../dist/index.js', import.meta.url));
  const child = spawn(process.execPath, [entry, 'providers'], { stdio: ['ignore', 'pipe', 'pipe'] });

  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  // Emulate `parallax providers | head -1`: read a little, then close the pipe.
  await new Promise((resolve) => {
    child.stdout.once('data', () => {
      child.stdout.destroy();
      resolve();
    });
    child.once('close', resolve);
  });

  const code = await new Promise((resolve) => {
    if (child.exitCode !== null) resolve(child.exitCode);
    else child.once('close', resolve);
  });

  assert.equal(code, 0, `exit code ${code}, stderr: ${stderr}`);
  assert.doesNotMatch(stderr, /EPIPE/);
});
