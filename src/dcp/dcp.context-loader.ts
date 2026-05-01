import type { ActiveRepoContext } from "../session/active-repo.store.js";
import { buildAiContextPath, ensureAiContextPath } from "../github/github.files.js";
import type { ContextRepository } from "../repository/context-repository.js";
import { configSchema, indexSchema, type ConfigFile, type IndexFile } from "./dcp.schemas.js";

export class DcpContextLoader {
  constructor(
    private readonly repository: ContextRepository,
    private readonly maxFilesPerInteraction: number,
  ) {}

  async loadSnapshot(repo: ActiveRepoContext): Promise<string | null> {
    const file = await this.repository.readTextFile(
      repo,
      buildAiContextPath("snapshot.md"),
      repo.branch,
    );

    return file?.content ?? null;
  }

  async loadIndex(repo: ActiveRepoContext): Promise<IndexFile | null> {
    const file = await this.repository.readJsonFile<IndexFile>(
      repo,
      buildAiContextPath("index.json"),
      repo.branch,
    );

    return file ? indexSchema.parse(file.data) : null;
  }

  async loadConfig(repo: ActiveRepoContext): Promise<ConfigFile | null> {
    const file = await this.repository.readJsonFile<ConfigFile>(
      repo,
      buildAiContextPath("config.json"),
      repo.branch,
    );

    return file ? configSchema.parse(file.data) : null;
  }

  async loadFile(repo: ActiveRepoContext, relativePath: string): Promise<string | null> {
    const file = await this.repository.readTextFile(
      repo,
      ensureAiContextPath(relativePath),
      repo.branch,
    );

    return file?.content ?? null;
  }

  async loadFiles(
    repo: ActiveRepoContext,
    relativePaths: string[],
  ): Promise<Array<{ path: string; content: string }>> {
    const limitedPaths = relativePaths.slice(0, this.maxFilesPerInteraction);
    const results: Array<{ path: string; content: string }> = [];

    for (const relativePath of limitedPaths) {
      const content = await this.loadFile(repo, relativePath);
      if (content) {
        results.push({
          path: ensureAiContextPath(relativePath),
          content,
        });
      }
    }

    return results;
  }
}
