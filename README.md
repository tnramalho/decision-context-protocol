# DCP

Decision Context Protocol.

DCP is an open source protocol for keeping project decisions, worklogs, and shared technical context synchronized across AI sessions through a repository.

It is not a chat-history product.
It is a structured context layer for project continuity.

## Status

This repository is the `0.1` MVP.

Current focus:
- GitHub-backed context storage
- MCP server for local AI tooling
- Snapshot-first context loading
- Append-only capture
- Explicit consolidation
- Pluggable repository backends

## Why

AI sessions are isolated by default.

That creates familiar failures:
- decisions disappear inside private chats
- new contributors have to ask the same questions again
- architecture rationale is lost
- handoffs between people are weak
- docs drift away from what was actually decided

DCP fixes that by storing structured context inside the project repository itself, under `.ai-context/`.

## What DCP is

- A protocol for capturing decisions, proposals, worklogs, reviews, and questions
- A thin operational layer over a repository
- An MCP server that AI tools can call
- A shared context model that survives across sessions and contributors

## What DCP is not

- A shared chat room
- A general knowledge base
- A vector database product
- A hosted SaaS
- A replacement for your source repository

## Core ideas

- One repository = one shared context space
- One AI session = one active repository
- `snapshot.md` is always the first file to read
- New contributions are append-only by default
- Consolidation is explicit, not automatic
- Decisions require human confirmation
- The repository remains the source of truth

## How it works

DCP stores project context in:

```txt
.ai-context/
```

Typical structure:

```txt
.ai-context/
  DCP.md
  snapshot.md
  index.json
  config.json
  inbox/
  decisions/
  summaries/
  worklogs/
  reviews/
  topics/
  audit/
```

The server follows a strict loading strategy:

1. Read `snapshot.md`
2. Read `index.json` only if needed
3. Load only a few targeted files
4. Avoid scanning the whole repository

## Features in this MVP

- Lazy GitHub authentication: the server boots without credentials
- `github-api` backend using `GITHUB_TOKEN`
- `github-mcp` backend for environments that already expose GitHub over MCP
- `auto` backend selection mode
- Runtime backend switching through MCP tools
- `.ai-context` initialization
- Append-only inbox capture
- Consolidation into decisions, summaries, snapshot, index, and audit log
- HTTP and `stdio` transports

## Architecture

```txt
AI client
  -> MCP
  -> DCP server
  -> repository backend
  -> project repository
  -> .ai-context/
```

Current backends:

- `github-api`
- `github-mcp`

## Repository backend modes

DCP supports three modes:

- `auto`: prefer `github-mcp` when configured, otherwise fall back to `github-api`
- `github-api`: use `GITHUB_TOKEN` with Octokit
- `github-mcp`: use a separate GitHub MCP server over `stdio` or HTTP

You can choose the mode with:

- environment variable: `DCP_REPOSITORY_MODE=auto|github-api|github-mcp`
- MCP tool: `set_repository_backend`

Inspect the current backend with:

- MCP tool: `get_repository_backend`

## Quick start

1. Clone the repository.
2. Install dependencies.
3. Start the server.
4. Connect it to your AI client.
5. Set a repository backend when you want real repository operations.

```bash
git clone <your-fork-or-repo-url>
cd decision-model-protocol
npm install
npm run dev
```

For local HTTP development on port `5000`:

```bash
npm run dev:http
```

## Environment

Copy `.env.example` to `.env` when you want explicit configuration.

```env
# Optional on startup. Required for real GitHub API operations.
GITHUB_TOKEN=

# Repository backend selection
DCP_REPOSITORY_MODE=auto

# DCP runtime
DCP_DEFAULT_BRANCH=main
DCP_MAX_FILES_PER_INTERACTION=3
DCP_MAX_CONTEXT_TOKENS=2000
DCP_DEFAULT_ACTOR=dcp-system

# Server transport
DCP_TRANSPORT=stdio
DCP_HOST=127.0.0.1
DCP_PORT=5000

# Optional GitHub MCP backend configuration
# DCP_GITHUB_MCP_TRANSPORT=stdio
# DCP_GITHUB_MCP_COMMAND=github-mcp-server
# DCP_GITHUB_MCP_ARGS=["stdio"]
# DCP_GITHUB_MCP_ENV={"GITHUB_PERSONAL_ACCESS_TOKEN":"ghp_xxx"}
# DCP_GITHUB_MCP_TRANSPORT=http
# DCP_GITHUB_MCP_URL=https://your-github-mcp-server.example.com/mcp
# DCP_GITHUB_MCP_AUTH_TOKEN=token
```

## Connect to Claude Code

### Option 1: local `stdio` server

Build first:

```bash
npm run build
```

Then add DCP as a local MCP server:

```bash
claude mcp add --transport stdio dcp -- node /absolute/path/to/decision-model-protocol/dist/index.js
```

If you want to pass a GitHub token directly:

```bash
claude mcp add --transport stdio --env GITHUB_TOKEN=ghp_xxx dcp -- node /absolute/path/to/decision-model-protocol/dist/index.js
```

### Option 2: local HTTP server

Start the HTTP server:

```bash
npm run dev:http
```

Then register it:

```bash
claude mcp add --transport http dcp http://127.0.0.1:5000/mcp
```

Claude Code MCP docs:

- https://code.claude.com/docs/en/mcp

## Share with a friend

The simplest team setup is:

1. Commit `.mcp.json` to the repository
2. Each person clones the repo
3. Each person runs `npm install` and `npm run build`
4. Each person opens Claude Code from the repository root
5. Claude Code prompts to approve the project-scoped MCP server from `.mcp.json`

Important:

- Project-scoped MCP servers are stored in `.mcp.json` and are intended to be shared through version control.
- Claude Code supports environment variable expansion in `.mcp.json`.
- Relative path mistakes are common, because `command` and `args` resolve from the directory where Claude Code was launched.

Recommended flow for you and your friend:

```bash
git clone git@github.com:tnramalho/decision-context-protocol.git
cd decision-context-protocol
npm install
npm run build
claude
```

Then, inside Claude Code:

- run `/mcp`
- approve the `dcp` server from `.mcp.json`

If someone rejected the project-scoped server earlier, reset the choice with:

```bash
claude mcp reset-project-choices
```

### More reliable local install

This repo also includes a helper script that registers the server in local scope with an absolute path:

```bash
./scripts/setup-claude-mcp.sh
```

That is usually the most reliable choice for day-to-day use, because it avoids relative path issues.

Your friend can do the same after cloning the repository.

### Credentials per person

Do not commit personal credentials.

Each person should set their own environment locally before launching Claude Code when using `github-api`:

```bash
export GITHUB_TOKEN=seu_token
claude
```

If you want to use the `github-mcp` backend instead, each person can set their own `DCP_GITHUB_MCP_*` variables locally.

## Basic local tests

Health check:

```bash
curl http://127.0.0.1:5000/health
```

MCP smoke test:

```bash
npm run test:http
```

This validates startup, MCP initialization, and tool discovery without requiring GitHub credentials.

## Available MCP tools

- `set_active_repo`
- `init_dcp`
- `get_status`
- `capture_context`
- `create_decision`
- `submit_proposal`
- `submit_worklog`
- `submit_review`
- `search_context`
- `consolidate_context`
- `get_decision`
- `get_repository_backend`
- `set_repository_backend`
- `reset_active_repo`

## Example workflow

1. Inspect backend status.
2. Choose a repository backend.
3. Set the active repository.
4. Initialize `.ai-context` if needed.
5. Capture decisions or worklogs.
6. Consolidate when ready.

Example backend switch:

```json
{
  "mode": "github-api"
}
```

Example `github-mcp` session config:

```json
{
  "mode": "github-mcp",
  "github_mcp": {
    "transport": "stdio",
    "command": "github-mcp-server",
    "args": ["stdio"],
    "env": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_xxx"
    }
  }
}
```

Example repository flow:

```txt
@dcp usar repo owner/repo
/context status
/context decision create "Arquitetura geral"
/context propose DEC-001
/context consolidate
```

## Project structure

```txt
src/
  dcp/
    dcp.service.ts
    dcp.schemas.ts
    dcp.templates.ts
    dcp.consolidator.ts
    dcp.context-loader.ts
  github/
    github.client.ts
    github.files.ts
  repository/
    context-repository.ts
    github-api.repository.ts
    github-mcp.repository.ts
    repository-router.ts
  session/
    active-repo.store.ts
  http-server.ts
  index.ts
  mcp-server.ts
  smoke-http.ts

templates/
  DCP.md
  snapshot.md
  index.json
  config.json
```

## Roadmap

- Better repository backend discovery and validation
- Consolidation review flow with explicit approval UX
- Better topic summaries and richer search
- Pull request based approval flow
- Broader platform support beyond GitHub

## Contributing

Contributions are welcome.

Start here:

- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [SECURITY.md](./SECURITY.md)

Useful scripts:

```bash
npm run check
npm run build
npm run dev
npm run dev:http
npm run test:http
```

## License

MIT.

See [LICENSE](./LICENSE).
