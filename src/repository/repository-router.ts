import type { RepoCoordinates } from "../github/github.files.js";
import type {
  ContextRepository,
  RepositoryDirectoryEntry,
  RepositoryInfo,
  RepositoryTextFile,
  RepositoryWriteTextFileParams,
} from "./context-repository.js";
import { GitHubApiRepository } from "./github-api.repository.js";
import type { GitHubMcpConfig } from "./github-mcp.repository.js";
import { GitHubMcpRepository } from "./github-mcp.repository.js";

export type RepositoryBackendMode = "auto" | "github-api" | "github-mcp";

export interface RepositoryRouterOptions {
  defaultMode: RepositoryBackendMode;
  githubApi: GitHubApiRepository;
  githubMcp: GitHubMcpRepository;
}

export interface RepositoryBackendSelection {
  mode: RepositoryBackendMode;
  github_mcp?: GitHubMcpConfig;
}

export class RepositoryRouter implements ContextRepository {
  readonly mode = "repository-router";

  private selection: RepositoryBackendSelection;

  constructor(private readonly options: RepositoryRouterOptions) {
    this.selection = {
      mode: options.defaultMode,
    };
  }

  setSelection(selection: RepositoryBackendSelection) {
    this.selection = {
      mode: selection.mode,
      github_mcp: selection.github_mcp,
    };

    this.options.githubMcp.setSessionConfig(selection.github_mcp ?? null);

    return this.getStatus();
  }

  getStatus() {
    const githubApiConfigured = this.options.githubApi.isConfigured();
    const githubMcpStatus = this.options.githubMcp.getStatus();
    const effectiveMode = this.getEffectiveMode();

    return {
      requested_mode: this.selection.mode,
      effective_mode: effectiveMode,
      ready: effectiveMode !== "unconfigured" && (
        effectiveMode === "github-api"
          ? githubApiConfigured
          : githubMcpStatus.configured
      ),
      github_api: {
        configured: githubApiConfigured,
      },
      github_mcp: githubMcpStatus,
    };
  }

  async getRepository(repo: RepoCoordinates): Promise<RepositoryInfo> {
    return await this.resolveRepository().getRepository(repo);
  }

  async readTextFile(
    repo: RepoCoordinates,
    path: string,
    ref?: string,
  ): Promise<RepositoryTextFile | null> {
    return await this.resolveRepository().readTextFile(repo, path, ref);
  }

  async readJsonFile<T>(
    repo: RepoCoordinates,
    path: string,
    ref?: string,
  ): Promise<{ data: T; sha: string } | null> {
    return await this.resolveRepository().readJsonFile<T>(repo, path, ref);
  }

  async listDirectory(
    repo: RepoCoordinates,
    path: string,
    ref?: string,
  ): Promise<RepositoryDirectoryEntry[]> {
    return await this.resolveRepository().listDirectory(repo, path, ref);
  }

  async writeTextFile(params: RepositoryWriteTextFileParams): Promise<string> {
    return await this.resolveRepository().writeTextFile(params);
  }

  isConflictError(error: unknown): boolean {
    return this.resolveRepository().isConflictError(error);
  }

  private resolveRepository(): ContextRepository {
    const effectiveMode = this.getEffectiveMode();
    if (effectiveMode === "github-mcp") {
      return this.options.githubMcp;
    }

    if (effectiveMode === "github-api") {
      return this.options.githubApi;
    }

    throw new Error(
      "No repository backend is ready. Configure GitHub access with GITHUB_TOKEN, or select github-mcp and provide its connection settings.",
    );
  }

  private getEffectiveMode(): RepositoryBackendMode | "unconfigured" {
    if (this.selection.mode === "github-api") {
      return "github-api";
    }

    if (this.selection.mode === "github-mcp") {
      return "github-mcp";
    }

    if (this.options.githubMcp.getStatus().configured) {
      return "github-mcp";
    }

    if (this.options.githubApi.isConfigured()) {
      return "github-api";
    }

    return "unconfigured";
  }
}
