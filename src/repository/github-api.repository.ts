import { GithubClient } from "../github/github.client.js";
import type {
  ContextRepository,
  RepositoryDirectoryEntry,
  RepositoryInfo,
  RepositoryTextFile,
  RepositoryWriteTextFileParams,
} from "./context-repository.js";
import type { RepoCoordinates } from "../github/github.files.js";

export interface GitHubApiRepositoryOptions {
  getToken: () => string | undefined;
}

export class GitHubApiRepository implements ContextRepository {
  readonly mode = "github-api";

  private client: GithubClient | null = null;

  constructor(private readonly options: GitHubApiRepositoryOptions) {}

  isConfigured(): boolean {
    return Boolean(this.options.getToken()?.trim());
  }

  async getRepository(repo: RepoCoordinates): Promise<RepositoryInfo> {
    return await this.getClient().getRepository(repo);
  }

  async readTextFile(
    repo: RepoCoordinates,
    path: string,
    ref?: string,
  ): Promise<RepositoryTextFile | null> {
    return await this.getClient().readTextFile(repo, path, ref);
  }

  async readJsonFile<T>(
    repo: RepoCoordinates,
    path: string,
    ref?: string,
  ): Promise<{ data: T; sha: string } | null> {
    return await this.getClient().readJsonFile<T>(repo, path, ref);
  }

  async listDirectory(
    repo: RepoCoordinates,
    path: string,
    ref?: string,
  ): Promise<RepositoryDirectoryEntry[]> {
    return await this.getClient().listDirectory(repo, path, ref);
  }

  async writeTextFile(params: RepositoryWriteTextFileParams): Promise<string> {
    return await this.getClient().writeTextFile(params);
  }

  isConflictError(error: unknown): boolean {
    return this.getClient().isConflictError(error);
  }

  private getClient(): GithubClient {
    if (this.client) {
      return this.client;
    }

    const token = this.options.getToken()?.trim();
    if (!token) {
      throw new Error(
        "This operation requires GitHub access, but GITHUB_TOKEN is not configured. Set GITHUB_TOKEN to read and write the target repository.",
      );
    }

    this.client = new GithubClient(token);
    return this.client;
  }
}
