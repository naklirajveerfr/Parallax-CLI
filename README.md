# ParallaxCLI

[![npm](https://img.shields.io/npm/v/parallaxcli.svg)](https://www.npmjs.com/package/parallaxcli)
[![CI](https://github.com/naklirajveerfr/Parallax-CLI/actions/workflows/ci.yml/badge.svg)](https://github.com/naklirajveerfr/Parallax-CLI/actions/workflows/ci.yml)

A terminal coding agent — bring your own API key. ParallaxCLI reads your code, edits files, and runs commands from the terminal, asking for approval before anything destructive.

30+ providers: Anthropic, OpenAI, Google Gemini, DeepSeek, xAI, Moonshot, MiniMax, Z.AI, Mistral, Cohere, AI21, OpenRouter, Groq, Cerebras, Fireworks, Together, Deep Infra, Baseten, NVIDIA, Hugging Face, Nebius, Azure, Vertex AI, Cloudflare, DigitalOcean, Snowflake, OCI, GitHub Copilot, and local Ollama / LM Studio.

```
$ parallax

  ╭──────────────────────────────────────────────╮
  │ ◆ parallax                            v0.3.0 │
  │ terminal coding agent                        │
  ╰──────────────────────────────────────────────╯
  model     claude-sonnet-5-5 (anthropic)
  workspace ~/Lab/myproject
  auth      no key · send a message and I’ll ask
  /help commands · /exit quit · ctrl+c cancel

┃ › add a health check endpoint to the server

  ┃ Anthropic needs an API key.
  ┃ Paste it below to store it in ~/.config/parallax/config.json.
  ┃ › ********

  ┃ I'll look at the server first.

  ┃ ╭─ read_file src/server.ts
  ┃ │ import express from 'express';
  ┃ │ …
  ┃ ╰─ done · 42ms

  ┃ ╭─ edit_file src/server.ts
  ┃ │ Edited src/server.ts
  ┃ ╰─ done · 12ms
  ┃ Added the `/health` route.
  ┃ 8.4k in · 412 out · 3.1s
```

## Install

Requires Node 22+.

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
npm install -g ./parallaxcli-0.2.1.tgz
```

The CLI installs two command names: `parallax` and `parallaxcli`. Use `parallaxcli` if another tool already owns `parallax`.

Installing straight from git (`npm install -g github:...`) does not work yet: npm skips devDependencies for global git installs, so the TypeScript build never runs. Clone and link as shown above, or use the npm package / release tarball.

Or run the build directly without linking:

```bash
node dist/index.js --help
```

## Quick start

```bash
parallax                             # start an interactive session
parallax login                       # or store a key up front (hidden input)
parallax -p "explain this repo"      # one-shot, for scripts
```

You do not need a key to start. The session opens normally and shows `no key`; the first message you send asks for one, saves it, and continues with that same message. `/login` replaces the key later. Non-interactive runs (piped input, CI) fail fast with the `parallax login` command instead of hanging on a prompt.

Keys are stored in `~/.config/parallax/config.json` with `0600` permissions. Environment variables take precedence, so `PARALLAX_API_KEY` or any provider-specific key (`ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, …) works without stored config. `parallax providers` shows the variable for each provider.

## Providers

Run `parallax providers` for the live list, default models, and required env vars. 30+ providers are available; most are OpenAI-compatible, so they need only a key.

**Frontier labs** — `anthropic`, `openai`, `google`, `deepseek`, `xai`, `moonshot`, `minimax`, `zai`, `mistral`, `cohere`, `ai21`, plus `openrouter`.

**Inference hosts** — `groq`, `cerebras`, `fireworks`, `together`, `deepinfra`, `baseten`, `nvidia`, `huggingface`, `nebius`.

```bash
parallax login --provider groq
parallax login --provider deepseek
parallax login --provider openrouter   # one key, hundreds of models
```

**Cloud and enterprise**

| Provider | Extra setup |
| --- | --- |
| `azure` | `AZURE_RESOURCE_NAME` or `AZURE_OPENAI_ENDPOINT`; key or `az login` for Entra ID |
| `vertex` | `GOOGLE_VERTEX_PROJECT` + gcloud ADC (or `GOOGLE_VERTEX_ACCESS_TOKEN`) |
| `cloudflare` | `CLOUDFLARE_ACCOUNT_ID` |
| `cloudflare-gateway` | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_GATEWAY_ID` |
| `digitalocean` | `DIGITALOCEAN_ACCESS_TOKEN` or a model access key |
| `snowflake` | `SNOWFLAKE_ACCOUNT` + `SNOWFLAKE_CORTEX_PAT` |
| `oci` | `OCI_GENAI_API_KEY` |
| `copilot` | `GITHUB_TOKEN` (try `gh auth token`); experimental, uses GitHub's internal Copilot API |

```bash
parallax login --provider azure --api-key "$AZURE_OPENAI_API_KEY"
parallax login --provider copilot --api-key "$(gh auth token)"
parallax --provider vertex --model gemini-4-carbon
```

**Local and offline**

```bash
parallax --provider ollama --model qwen3-coder
parallax --provider lmstudio
parallax --provider mock          # UI demo, no key
```

**Not supported yet** — `bedrock` (needs AWS SigV4/Converse), `sap` (OAuth + deployment URL), `gitlab` (proprietary Duo API), `chatgpt` (subscriptions have no public API). For any other OpenAI-compatible endpoint, use `--provider openai --base-url <url> --model <id>`.

Default model ids come from the [Models.dev](https://models.dev) directory and can drift; override per provider with `--model` or `/model` in-session. Switch providers mid-session with `/provider groq`.

## Usage

```
parallax                       Interactive session
parallax "prompt"              One-shot
parallax -p "prompt"           One-shot (script friendly)
parallax login                 Store a key
parallax providers             List providers, models, and auth
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
| `/login` | Store or replace the API key |
| `/tools` | List tools |
| `/config` | Show saved config |
| `/providers` | List providers and auth |
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
