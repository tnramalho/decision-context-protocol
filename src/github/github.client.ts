import { Buffer } from "node:buffer";
import { Octokit } from "octokit";

import type { RepoCoordinates } from "./github.files.js";

export interface GithubTextFile {
  content: string;
  sha: string;
  path: string;
}

export interface GithubDirectoryEntry {
  name: string;
  path: string;
  sha: string;
  type: "dir" | "file" | "submodule" | "symlink";
}

export interface GithubRepositoryInfo {
  defaultBranch: string;
  fullName: string;
  private: boolean;
}

export class GithubClient {
  private readonly octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  async getRepository(repo: RepoCoordinates): Promise<GithubRepositoryInfo> {
    const response = await this.octokit.rest.repos.get({
      owner: repo.owner,
      repo: repo.repo,
    });

    return {
      defaultBranch: response.data.default_branch,
      fullName: response.data.full_name,
      private: response.data.private,
    };
  }

  async readTextFile(
    repo: RepoCoordinates,
    path: string,
    ref?: string,
  ): Promise<GithubTextFile | null> {
    try {
      const response = await this.octokit.rest.repos.getContent({
        owner: repo.owner,
        repo: repo.repo,
        path,
        ref,
      });

      if (Array.isArray(response.data) || response.data.type !== "file") {
        return null;
      }

      const raw = response.data.content ?? "";
      const encoding = response.data.encoding === "base64" ? "base64" : "utf8";
      const content = Buffer.from(raw, encoding).toString("utf8");

      return {
        content,
        sha: response.data.sha,
        path: response.data.path,
      };
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return null;
      }

      throw error;
    }
  }

  async readJsonFile<T>(
    repo: RepoCoordinates,
    path: string,
    ref?: string,
  ): Promise<{ data: T; sha: string } | null> {
    const file = await this.readTextFile(repo, path, ref);
    if (!file) {
      return null;
    }

    return {
      data: JSON.parse(file.content) as T,
      sha: file.sha,
    };
  }

  async listDirectory(
    repo: RepoCoordinates,
    path: string,
    ref?: string,
  ): Promise<GithubDirectoryEntry[]> {
    try {
      const response = await this.octokit.rest.repos.getContent({
        owner: repo.owner,
        repo: repo.repo,
        path,
        ref,
      });

      if (!Array.isArray(response.data)) {
        return [];
      }

      return response.data.map((entry) => ({
        name: entry.name,
        path: entry.path,
        sha: entry.sha,
        type: entry.type,
      }));
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return [];
      }

      throw error;
    }
  }

  async writeTextFile(params: {
    repo: RepoCoordinates;
    path: string;
    content: string;
    message: string;
    branch: string;
    sha?: string;
  }): Promise<string> {
    const response = await this.octokit.rest.repos.createOrUpdateFileContents({
      owner: params.repo.owner,
      repo: params.repo.repo,
      path: params.path,
      message: params.message,
      content: Buffer.from(params.content, "utf8").toString("base64"),
      branch: params.branch,
      sha: params.sha,
    });

    const commitSha = response.data.commit.sha;
    if (!commitSha) {
      throw new Error(`GitHub did not return a commit SHA for ${params.path}.`);
    }

    return commitSha;
  }

  isConflictError(error: unknown): boolean {
    const status = (error as { status?: number } | undefined)?.status;
    return status === 409 || status === 422;
  }

  private isNotFoundError(error: unknown): boolean {
    return (error as { status?: number } | undefined)?.status === 404;
  }
}
