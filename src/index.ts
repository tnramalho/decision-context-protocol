import "dotenv/config";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { DcpService } from "./dcp/dcp.service.js";
import { startHttpServer } from "./http-server.js";
import { createMcpServer } from "./mcp-server.js";
import { GitHubApiRepository } from "./repository/github-api.repository.js";
import { GitHubMcpRepository, type GitHubMcpConfig } from "./repository/github-mcp.repository.js";
import { RepositoryRouter, type RepositoryBackendMode } from "./repository/repository-router.js";
import { ActiveRepoStore } from "./session/active-repo.store.js";

function getNumberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${name} must be a positive number.`);
  }

  return parsed;
}

function getOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function getJsonEnv<T>(name: string): T | undefined {
  const value = getOptionalEnv(name);
  if (!value) {
    return undefined;
  }

  return JSON.parse(value) as T;
}

function getRepositoryModeEnv(): RepositoryBackendMode {
  const value = process.env.DCP_REPOSITORY_MODE?.trim() as RepositoryBackendMode | undefined;
  if (value === "github-api" || value === "github-mcp" || value === "auto") {
    return value;
  }

  return "auto";
}

function getDefaultGitHubMcpConfigFromEnv(): GitHubMcpConfig | null {
  const transport = getOptionalEnv("DCP_GITHUB_MCP_TRANSPORT") as
    | "stdio"
    | "http"
    | undefined;
  const command = getOptionalEnv("DCP_GITHUB_MCP_COMMAND");
  const url = getOptionalEnv("DCP_GITHUB_MCP_URL");
  const cwd = getOptionalEnv("DCP_GITHUB_MCP_CWD");
  const authToken = getOptionalEnv("DCP_GITHUB_MCP_AUTH_TOKEN");
  const args = getJsonEnv<string[]>("DCP_GITHUB_MCP_ARGS");
  const env = getJsonEnv<Record<string, string>>("DCP_GITHUB_MCP_ENV");
  const headers = getJsonEnv<Record<string, string>>("DCP_GITHUB_MCP_HEADERS");

  if (!transport && !command && !url && !cwd && !authToken && !args && !env && !headers) {
    return null;
  }

  return {
    transport,
    command,
    args,
    env,
    cwd,
    url,
    headers,
    auth_token: authToken,
  };
}

async function main() {
  const repoStore = new ActiveRepoStore();
  const githubApi = new GitHubApiRepository({
    getToken: () => process.env.GITHUB_TOKEN,
  });
  const githubMcp = new GitHubMcpRepository({
    getDefaultConfig: () => getDefaultGitHubMcpConfigFromEnv(),
  });
  const repository = new RepositoryRouter({
    defaultMode: getRepositoryModeEnv(),
    githubApi,
    githubMcp,
  });
  const service = new DcpService({
    repository,
    repoStore,
    defaultBranch: process.env.DCP_DEFAULT_BRANCH?.trim() || "main",
    maxFilesPerInteraction: getNumberEnv("DCP_MAX_FILES_PER_INTERACTION", 3),
    maxContextTokens: getNumberEnv("DCP_MAX_CONTEXT_TOKENS", 2000),
    defaultActor: process.env.DCP_DEFAULT_ACTOR?.trim() || "dcp-system",
  });
  const transportMode = process.env.DCP_TRANSPORT?.trim().toLowerCase() || "stdio";

  if (transportMode === "http") {
    const host = process.env.DCP_HOST?.trim() || "127.0.0.1";
    const port = getNumberEnv("DCP_PORT", 5000);
    await startHttpServer(service, { host, port });
    console.log(`DCP HTTP server listening on http://${host}:${port}`);
    return;
  }

  const server = createMcpServer(service);
  const transport = new StdioServerTransport();

  await server.connect(transport);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
