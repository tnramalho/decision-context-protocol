import { Buffer } from "node:buffer";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import type { RepoCoordinates } from "../github/github.files.js";
import type {
  ContextRepository,
  RepositoryDirectoryEntry,
  RepositoryInfo,
  RepositoryTextFile,
  RepositoryWriteTextFileParams,
} from "./context-repository.js";

export type GitHubMcpTransport = "stdio" | "http";

export interface GitHubMcpConfig {
  transport?: GitHubMcpTransport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
  auth_token?: string;
}

interface ResolvedGitHubMcpConfig {
  transport: GitHubMcpTransport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
  auth_token?: string;
}

interface ToolCallResult {
  content?: Array<
    | { type: "text"; text: string }
    | { type: "resource"; resource: { text?: string; uri: string; mimeType?: string } }
  >;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export interface GitHubMcpRepositoryOptions {
  getDefaultConfig: () => GitHubMcpConfig | null;
}

export class GitHubMcpRepository implements ContextRepository {
  readonly mode = "github-mcp";

  private sessionConfig: GitHubMcpConfig | null = null;
  private client: Client | null = null;
  private transport:
    | StdioClientTransport
    | StreamableHTTPClientTransport
    | null = null;
  private connectionKey: string | null = null;
  private connectingPromise: Promise<Client> | null = null;

  constructor(private readonly options: GitHubMcpRepositoryOptions) {}

  setSessionConfig(config: GitHubMcpConfig | null): void {
    this.sessionConfig = config;
    this.resetConnection();
  }

  getStatus() {
    const explicitConfig = this.getMergedConfig(false);
    const resolvedConfig = this.getMergedConfig(true);

    return {
      configured: Boolean(explicitConfig),
      transport: resolvedConfig?.transport ?? null,
      command: resolvedConfig?.command ?? null,
      url: resolvedConfig?.url ?? null,
      has_auth_token: Boolean(resolvedConfig?.auth_token),
    };
  }

  async getRepository(repo: RepoCoordinates): Promise<RepositoryInfo> {
    const payload = await this.callTool("search_repositories", {
      query: `repo:${repo.owner}/${repo.repo}`,
      perPage: 1,
      page: 1,
      minimal_output: false,
    });

    const items = this.getRepositorySearchItems(payload);
    const match =
      items.find((item) => {
        const fullName = this.readString(item, "full_name", "fullName");
        return fullName?.toLowerCase() === `${repo.owner}/${repo.repo}`.toLowerCase();
      }) ?? items[0];

    if (!match) {
      throw new Error(`Repository ${repo.owner}/${repo.repo} was not found via GitHub MCP.`);
    }

    return {
      defaultBranch:
        this.readString(match, "default_branch", "defaultBranch") ?? "main",
      fullName:
        this.readString(match, "full_name", "fullName") ??
        `${repo.owner}/${repo.repo}`,
      private: this.readBoolean(match, "private") ?? false,
    };
  }

  async readTextFile(
    repo: RepoCoordinates,
    path: string,
    ref?: string,
  ): Promise<RepositoryTextFile | null> {
    const normalizedPath = path.replace(/^\/+/, "");
    const payload = await this.callTool("get_file_contents", {
      owner: repo.owner,
      repo: repo.repo,
      path: normalizedPath || undefined,
      ref,
    });

    const asFile = this.normalizeFilePayload(payload, normalizedPath);
    if (!asFile) {
      return null;
    }

    return {
      content: asFile.content,
      sha: asFile.sha ?? "",
      path: asFile.path ?? normalizedPath,
    };
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
  ): Promise<RepositoryDirectoryEntry[]> {
    const normalizedPath = path.replace(/^\/+/, "");
    const payload = await this.callTool("get_file_contents", {
      owner: repo.owner,
      repo: repo.repo,
      path: normalizedPath || undefined,
      ref,
    });

    const entries = this.normalizeDirectoryPayload(payload);
    return entries.map((entry) => ({
      name: this.readString(entry, "name") ?? "",
      path: this.readString(entry, "path") ?? "",
      sha: this.readString(entry, "sha") ?? "",
      type: this.normalizeEntryType(this.readString(entry, "type")),
    }));
  }

  async writeTextFile(params: RepositoryWriteTextFileParams): Promise<string> {
    const payload = await this.callTool("create_or_update_file", {
      owner: params.repo.owner,
      repo: params.repo.repo,
      branch: params.branch,
      path: params.path,
      content: params.content,
      message: params.message,
      sha: params.sha,
    });

    const commitSha =
      this.readNestedString(payload, ["commit", "sha"]) ??
      this.readNestedString(payload, ["content", "sha"]) ??
      (this.isRecord(payload) ? this.readString(payload, "sha") : null);

    if (!commitSha) {
      throw new Error(
        `GitHub MCP did not return a commit SHA for ${params.path}.`,
      );
    }

    return commitSha;
  }

  isConflictError(error: unknown): boolean {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return (
      message.includes("sha") ||
      message.includes("conflict") ||
      message.includes("409") ||
      message.includes("422")
    );
  }

  private async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const client = await this.getClient();
    const result = (await client.callTool({
      name,
      arguments: Object.fromEntries(
        Object.entries(args).filter(([, value]) => value !== undefined),
      ),
    })) as ToolCallResult;

    if (result.isError) {
      throw new Error(this.extractRawText(result) || `GitHub MCP tool ${name} failed.`);
    }

    return this.extractPayload(result);
  }

  private async getClient(): Promise<Client> {
    const config = this.requireConfig();
    const nextConnectionKey = JSON.stringify(config);

    if (this.client && this.connectionKey === nextConnectionKey) {
      return this.client;
    }

    if (this.connectingPromise && this.connectionKey === nextConnectionKey) {
      return await this.connectingPromise;
    }

    this.resetConnection();
    this.connectionKey = nextConnectionKey;
    this.connectingPromise = this.connect(config);

    try {
      this.client = await this.connectingPromise;
      return this.client;
    } finally {
      this.connectingPromise = null;
    }
  }

  private async connect(config: ResolvedGitHubMcpConfig): Promise<Client> {
    const client = new Client({
      name: "dcp-github-mcp-client",
      version: "0.1.0",
    });

    if (config.transport === "http") {
      const headers = {
        ...(config.headers ?? {}),
        ...(config.auth_token
          ? { Authorization: `Bearer ${config.auth_token}` }
          : {}),
      };

      this.transport = new StreamableHTTPClientTransport(new URL(config.url!), {
        requestInit: {
          headers,
        },
      });
    } else {
      this.transport = new StdioClientTransport({
        command: config.command!,
        args: config.args,
        env: config.env,
        cwd: config.cwd,
      });
    }

    await client.connect(this.transport);
    return client;
  }

  private requireConfig(): ResolvedGitHubMcpConfig {
    const config = this.getMergedConfig(true);
    if (!config) {
      throw new Error(
        "GitHub MCP backend is not configured. Set DCP_GITHUB_MCP_URL or DCP_GITHUB_MCP_COMMAND, or call set_repository_backend with github_mcp settings.",
      );
    }

    if (config.transport === "http" && !config.url) {
      throw new Error("GitHub MCP backend requires a URL when transport is http.");
    }

    if (config.transport === "stdio" && !config.command) {
      throw new Error(
        "GitHub MCP backend requires a command when transport is stdio.",
      );
    }

    return config;
  }

  private getMergedConfig(applyDefaults: boolean): ResolvedGitHubMcpConfig | null {
    const defaultConfig = this.options.getDefaultConfig();
    const sessionConfig = this.sessionConfig;
    const merged: GitHubMcpConfig = {
      ...(defaultConfig ?? {}),
      ...(sessionConfig ?? {}),
      env: {
        ...(defaultConfig?.env ?? {}),
        ...(sessionConfig?.env ?? {}),
      },
      headers: {
        ...(defaultConfig?.headers ?? {}),
        ...(sessionConfig?.headers ?? {}),
      },
    };

    const hasExplicitConfig = Boolean(
      merged.url ||
        merged.command ||
        (merged.args && merged.args.length > 0) ||
        sessionConfig ||
        defaultConfig,
    );

    if (!hasExplicitConfig) {
      return null;
    }

    const transport = merged.transport ?? "stdio";
    return {
      transport,
      command:
        merged.command ?? (applyDefaults && transport === "stdio" ? "github-mcp-server" : undefined),
      args:
        merged.args ??
        (applyDefaults && transport === "stdio" ? ["stdio"] : undefined),
      env: Object.keys(merged.env ?? {}).length ? merged.env : undefined,
      cwd: merged.cwd,
      url: merged.url,
      headers: Object.keys(merged.headers ?? {}).length ? merged.headers : undefined,
      auth_token: merged.auth_token,
    };
  }

  private resetConnection(): void {
    const currentTransport = this.transport;
    this.transport = null;
    this.client = null;
    this.connectionKey = null;
    this.connectingPromise = null;

    if (currentTransport) {
      void currentTransport.close().catch(() => undefined);
    }
  }

  private extractPayload(result: ToolCallResult): unknown {
    if (result.structuredContent) {
      return result.structuredContent;
    }

    const resourceText = result.content
      ?.filter((block): block is { type: "resource"; resource: { text?: string; uri: string } } => block.type === "resource")
      .map((block) => block.resource.text)
      .find(Boolean);

    if (resourceText) {
      return this.tryParseJson(resourceText) ?? resourceText;
    }

    const rawText = this.extractRawText(result);
    return this.tryParseJson(rawText) ?? rawText;
  }

  private extractRawText(result: ToolCallResult): string | null {
    if (!result.content) {
      return null;
    }

    const parts = result.content.flatMap((block) => {
      if (block.type === "text") {
        return [block.text];
      }

      if (block.type === "resource" && block.resource.text) {
        return [block.resource.text];
      }

      return [];
    });

    return parts.length ? parts.join("\n") : null;
  }

  private tryParseJson(text: string | null): unknown | null {
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  private getRepositorySearchItems(payload: unknown): Record<string, unknown>[] {
    if (Array.isArray(payload)) {
      return payload.filter(this.isRecord);
    }

    if (!this.isRecord(payload)) {
      return [];
    }

    const directItems = payload.items;
    if (Array.isArray(directItems)) {
      return directItems.filter(this.isRecord);
    }

    const repositories = payload.repositories;
    if (Array.isArray(repositories)) {
      return repositories.filter(this.isRecord);
    }

    return [];
  }

  private normalizeFilePayload(payload: unknown, fallbackPath: string) {
    if (!this.isRecord(payload)) {
      if (typeof payload === "string") {
        return {
          content: payload,
          path: fallbackPath,
          sha: "",
        };
      }

      return null;
    }

    const recordType = this.readString(payload, "type");
    if (recordType === "dir" || Array.isArray(payload.entries)) {
      return null;
    }

    let content =
      this.readString(payload, "content") ??
      this.readString(payload, "text") ??
      this.readNestedString(payload, ["file", "content"]);

    const encoding =
      this.readString(payload, "encoding") ??
      this.readNestedString(payload, ["file", "encoding"]);

    if (content && encoding?.toLowerCase() === "base64") {
      content = Buffer.from(content, "base64").toString("utf8");
    }

    if (!content) {
      return null;
    }

    return {
      content,
      path:
        this.readString(payload, "path") ??
        this.readNestedString(payload, ["file", "path"]) ??
        fallbackPath,
      sha:
        this.readString(payload, "sha") ??
        this.readNestedString(payload, ["file", "sha"]) ??
        "",
    };
  }

  private normalizeDirectoryPayload(payload: unknown): Record<string, unknown>[] {
    if (Array.isArray(payload)) {
      return payload.filter(this.isRecord);
    }

    if (!this.isRecord(payload)) {
      return [];
    }

    const entries = payload.entries;
    if (Array.isArray(entries)) {
      return entries.filter(this.isRecord);
    }

    const items = payload.items;
    if (Array.isArray(items)) {
      return items.filter(this.isRecord);
    }

    if (this.readString(payload, "type") === "dir") {
      return [payload];
    }

    return [];
  }

  private normalizeEntryType(value: string | null | undefined): RepositoryDirectoryEntry["type"] {
    if (value === "dir" || value === "file" || value === "submodule" || value === "symlink") {
      return value;
    }

    return "file";
  }

  private readNestedString(
    payload: unknown,
    path: string[],
  ): string | null {
    let current: unknown = payload;
    for (const key of path) {
      if (!this.isRecord(current)) {
        return null;
      }
      current = current[key];
    }

    return typeof current === "string" ? current : null;
  }

  private readString(
    payload: Record<string, unknown>,
    ...keys: string[]
  ): string | null {
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === "string") {
        return value;
      }
    }

    return null;
  }

  private readBoolean(
    payload: Record<string, unknown>,
    key: string,
  ): boolean | null {
    const value = payload[key];
    return typeof value === "boolean" ? value : null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}
