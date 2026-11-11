import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { parseArgs } from '../dist/cli/args.js';
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
