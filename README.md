# ParallaxCLI

A terminal coding agent — bring your own API key. ParallaxCLI reads your code, edits files, and runs commands from the terminal, asking for approval before anything destructive.

Works with Anthropic and any OpenAI-compatible API (OpenAI, OpenRouter, Groq, Together, local Ollama / LM Studio).

```
$ parallax
  ParallaxCLI v0.1.0
  anthropic · claude-sonnet-4-5 · ~/Lab/myproject
  /help for commands, /exit to quit

› add a health check endpoint to the server

⏺ read_file src/server.ts
⎿  src/server.ts (84 lines)
   1| import express from 'express';
   …

⏺ edit_file src/server.ts
⚠ Edit src/server.ts
    - app.listen(port)
    + app.get('/health', (_req, res) => res.json({ ok: true }))
    + app.listen(port)
  Allow? [y]es / [n]o / [a]lways: y
⎿  Edited src/server.ts
```

## Install

Requires Node 20+.

From npm (after publishing):

```bash
npm install -g parallaxcli
parallax --version

# or run without installing
npx parallaxcli
```

From this repository:

```bash
git clone https://github.com/naklirajveerfr/Parallax-CLI.git
cd Parallax-CLI
npm install
npm run build
npm link          # puts `parallax` and `parallaxcli` on your PATH
```

From a release tarball:

```bash
npm install -g ./parallaxcli-0.1.0.tgz
```

The CLI installs two command names: `parallax` and `parallaxcli`. Use `parallaxcli` if another tool already owns `parallax`.

Installing straight from git (`npm install -g github:...`) does not work yet: npm skips devDependencies for global git installs, so the TypeScript build never runs. Clone and link as shown above, or use the npm package / release tarball.

Or run the build directly without linking:

```bash
node dist/index.js --help
```

## Quick start

```bash
parallax login                       # paste an API key (hidden input)
parallax                             # start an interactive session
parallax -p "explain this repo"      # one-shot, for scripts
```

Keys are stored in `~/.config/parallax/config.json` with `0600` permissions. Environment variables take precedence, so `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, or `PARALLAX_API_KEY` work without any stored config.

## Providers

```bash
# Anthropic
parallax login --provider anthropic

# OpenAI
parallax login --provider openai

# OpenRouter (one key, many models)
parallax login --provider openrouter
# default model: anthropic/claude-sonnet-4.5
# in-session: /model openai/gpt-4.1  or  /model google/gemini-2.5-pro

# Local Ollama (no key needed)
parallax --provider openai --base-url http://localhost:11434/v1 --model llama3.1

# Offline demo, no key at all
parallax --provider mock
```

Switch mid-session with `/provider openai` or `/model gpt-4.1-mini`.

## Usage

```
parallax                       Interactive session
parallax "prompt"              One-shot
parallax -p "prompt"           One-shot (script friendly)
parallax login                 Store a key
parallax config                Show config
parallax config set <k> <v>    provider | model | base-url | api-key
parallax config unset <k>      Clear a setting
parallax config path           Print config path
```

Options: `--provider`, `--model`, `--base-url`, `--api-key`, `--cwd`, `--yes`, `--allow-outside`, `--max-steps`, `--max-tokens`, `--help`, `--version`.

### In-session commands

| Command | Purpose |
| --- | --- |
| `/help` | Command list |
| `/clear` | Forget the conversation |
| `/model [name]` | Show or switch the model |
| `/provider [name]` | Show or switch provider |
| `/tools` | List tools |
| `/config` | Show saved config |
| `/cost` | Session token usage |
| `/exit` | Quit |

Press `Ctrl+C` to cancel a running turn; press it again at the prompt to quit. End a line with `\` for multi-line input.

## Tools

| Tool | What it does | Approval |
| --- | --- | --- |
| `read_file` | Line-numbered file reads with offset/limit | no |
| `list_files` | Glob search, skips `node_modules`/`.git`/build dirs | no |
| `grep` | Regex content search | no |
| `write_file` | Create or overwrite a file | **yes** |
| `edit_file` | Exact-string replacement | **yes** |
| `bash` | Shell command in the workspace | **yes** |

Approval prompts offer `y` (once), `n` (skip), or `a` (for the rest of the session). Riskier commands — `rm -rf`, `git reset --hard`, `sudo`, piping curl into a shell, and similar — are flagged in red before you decide.

Notes:

- Without a TTY (or with `-p`), actions are **denied** unless you pass `--yes`. This keeps automated runs safe by default.
- File **writes and edits** are confined to the workspace. `--allow-outside` lifts that restriction.
- `bash` is a real shell and is not sandboxed: commands can read and write outside the workspace. Keep approvals on when you don't trust the model's plan.
- Tool output sent to the model is ANSI-stripped; colors stay in your terminal only.

## Configuration

`~/.config/parallax/config.json`:

```json
{
  "provider": "openrouter",
  "models": { "openrouter": "anthropic/claude-sonnet-4.5" },
  "baseUrls": { "openai": "https://openrouter.ai/api/v1" },
  "apiKeys": { "openrouter": "sk-or-..." }
}
```

`XDG_CONFIG_HOME` is respected. Conversation history is kept in `~/.config/parallax/history`.

## Development

```bash
npm run dev -- --provider mock     # run from source with tsx
npm run typecheck
npm test                           # builds, then runs tool/agent tests
```

## Publishing

The npm name `parallaxcli` was available at the time of writing. `prepublishOnly` builds and runs the test suite, and `prepare` builds on install from git.

```bash
npm login
npm publish               # publish the current version
npm version patch         # then publish again for a release
```

Before the first publish, add `repository`, `homepage`, and `bugs` to `package.json` (and optionally `author`). For a scoped fallback, publish as `@yourname/parallaxcli` — `publishConfig.access` is already `public`.

Layout:

```
src/
  agent/        tool loop + system prompt
  cli/          argument parsing, REPL, config commands
  providers/    Anthropic, OpenAI-compatible, and mock adapters
  tools/        file, grep, and shell tools + approval logic
  ui/           streaming renderer, hidden-input prompts
  config.ts     config file and key resolution
```

## License

MIT
