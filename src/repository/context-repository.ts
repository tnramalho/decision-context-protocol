import type { RepoCoordinates } from "../github/github.files.js";

export interface RepositoryTextFile {
  content: string;
  sha: string;
  path: string;
}

export interface RepositoryDirectoryEntry {
  name: string;
  path: string;
  sha: string;
  type: "dir" | "file" | "submodule" | "symlink";
}

export interface RepositoryInfo {
  defaultBranch: string;
  fullName: string;
  private: boolean;
}

export interface RepositoryWriteTextFileParams {
  repo: RepoCoordinates;
  path: string;
  content: string;
  message: string;
  branch: string;
  sha?: string;
}

export interface ContextRepository {
  readonly mode: string;

  getRepository(repo: RepoCoordinates): Promise<RepositoryInfo>;
  readTextFile(
    repo: RepoCoordinates,
    path: string,
    ref?: string,
  ): Promise<RepositoryTextFile | null>;
  readJsonFile<T>(
    repo: RepoCoordinates,
    path: string,
    ref?: string,
  ): Promise<{ data: T; sha: string } | null>;
  listDirectory(
    repo: RepoCoordinates,
    path: string,
    ref?: string,
  ): Promise<RepositoryDirectoryEntry[]>;
  writeTextFile(params: RepositoryWriteTextFileParams): Promise<string>;
  isConflictError(error: unknown): boolean;
}
