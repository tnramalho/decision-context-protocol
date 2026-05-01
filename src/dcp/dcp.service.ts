import type { ActiveRepoContext } from "../session/active-repo.store.js";
import { ActiveRepoStore } from "../session/active-repo.store.js";
import {
  AI_CONTEXT_DIR,
  DCP_DIRECTORIES,
  buildAiContextPath,
  buildInboxFilename,
  decisionIdToNumber,
  extractDecisionIdFromPath,
  formatRepoLabel,
  normalizeRepoReference,
  slugify,
} from "../github/github.files.js";
import type { ContextRepository } from "../repository/context-repository.js";
import { RepositoryRouter } from "../repository/repository-router.js";
import {
  captureContextInputSchema,
  configSchema,
  createDecisionInputSchema,
  decisionRecordSchema,
  getDecisionInputSchema,
  inboxRecordSchema,
  initDcpInputSchema,
  proposalRecordSchema,
  reviewRecordSchema,
  searchContextInputSchema,
  setActiveRepoInputSchema,
  submitProposalInputSchema,
  submitReviewInputSchema,
  submitWorklogInputSchema,
  worklogRecordSchema,
  questionRecordSchema,
  consolidateContextInputSchema,
  getRepositoryBackendInputSchema,
  setRepositoryBackendInputSchema,
  type CaptureContextInput,
  type ConfigFile,
  type IndexFile,
  type InboxRecord,
} from "./dcp.schemas.js";
import { DcpContextLoader } from "./dcp.context-loader.js";
import { DcpConsolidator } from "./dcp.consolidator.js";
import {
  renderDcpDocument,
  renderInitialConfig,
  renderInitialIndex,
  renderInitialSnapshot,
} from "./dcp.templates.js";

export interface DcpServiceOptions {
  repository: RepositoryRouter;
  repoStore: ActiveRepoStore;
  defaultBranch: string;
  maxFilesPerInteraction: number;
  maxContextTokens: number;
  defaultActor: string;
}

export class DcpService {
  private readonly loader: DcpContextLoader;
  private readonly consolidator: DcpConsolidator;

  constructor(private readonly options: DcpServiceOptions) {
    this.loader = new DcpContextLoader(
      options.repository,
      options.maxFilesPerInteraction,
    );
    this.consolidator = new DcpConsolidator();
  }

  async setActiveRepo(input: unknown) {
    const parsed = setActiveRepoInputSchema.parse(input);
    const repoRef = normalizeRepoReference(parsed.repo);
    const repoInfo = await this.options.repository.getRepository(repoRef);
    const activeRepo = this.options.repoStore.set({
      ...repoRef,
      branch: repoInfo.defaultBranch || this.options.defaultBranch,
    });

    const snapshot = await this.loader.loadSnapshot(activeRepo);

    return {
      active_repo: formatRepoLabel(activeRepo),
      branch: activeRepo.branch,
      dcp_exists: Boolean(snapshot),
      snapshot,
      repository_backend: this.options.repository.getStatus(),
    };
  }

  async initDcp(input: unknown) {
    const parsed = initDcpInputSchema.parse(input);
    const activeRepo = await this.resolveOrSetRepo(parsed.repo);
    const projectName = parsed.project_name ?? activeRepo.repo;

    const now = new Date().toISOString();
    const createdFiles = await this.initializeAiContextFiles(activeRepo, projectName, now);

    await this.appendAuditLine(activeRepo, {
      timestamp: now,
      actor: this.options.defaultActor,
      action: "init_dcp",
      path: AI_CONTEXT_DIR,
      commit: "pending",
    });

    return {
      active_repo: formatRepoLabel(activeRepo),
      created_files: createdFiles,
      dcp_exists: true,
      repository_backend: this.options.repository.getStatus(),
    };
  }

  async getStatus() {
    const activeRepo = await this.requireInitializedRepo();
    const snapshot = await this.loader.loadSnapshot(activeRepo);
    const index = await this.requireIndex(activeRepo);
    const inboxEntries = await this.listInboxFiles(activeRepo);

    return {
      active_repo: formatRepoLabel(activeRepo),
      branch: activeRepo.branch,
      last_updated_at: index.last_updated_at,
      active_decisions: index.active_decisions.length,
      approved_decisions: index.approved_decisions.length,
      inbox_pending_items: inboxEntries.length,
      snapshot_excerpt: snapshot?.split("\n").slice(0, 14).join("\n") ?? null,
      repository_backend: this.options.repository.getStatus(),
    };
  }

  async getRepositoryBackend(input: unknown) {
    getRepositoryBackendInputSchema.parse(input);

    return this.options.repository.getStatus();
  }

  async setRepositoryBackend(input: unknown) {
    const parsed = setRepositoryBackendInputSchema.parse(input);
    return this.options.repository.setSelection({
      mode: parsed.mode,
      github_mcp: parsed.github_mcp,
    });
  }

  async captureContext(input: unknown) {
    const parsed = captureContextInputSchema.parse(input);

    switch (parsed.type) {
      case "decision":
        return this.captureDecisionFromGeneric(parsed);
      case "proposal":
        return this.submitProposal({
          ...parsed.content,
          author: parsed.author,
        });
      case "worklog":
        return this.submitWorklog({
          ...parsed.content,
          author: parsed.author,
        });
      case "review":
        return this.submitReview({
          ...parsed.content,
          author: parsed.author,
        });
      case "question":
        return this.submitQuestion(parsed);
    }
  }

  async createDecision(input: unknown) {
    const parsed = createDecisionInputSchema.parse(input);
    const activeRepo = await this.requireInitializedRepo();
    const now = new Date().toISOString();
    const decisionId = await this.getNextDecisionId(activeRepo);
    const record = decisionRecordSchema.parse({
      type: "decision",
      decision_id: decisionId,
      title: parsed.title,
      status: "under_review",
      context: parsed.context,
      decision: "Pending human confirmation.",
      why: "Pending human confirmation.",
      alternatives: [],
      tradeoffs: [],
      topics: parsed.topics,
      created_by: parsed.created_by,
      created_at: now,
    });

    const result = await this.writeInboxRecord(activeRepo, record, {
      actor: parsed.created_by,
      action: "create_decision",
      operation: `create ${decisionId}`,
    });

    return {
      created: true,
      decision_id: decisionId,
      path: result.path,
      commit_sha: result.commitSha,
      active_repo: formatRepoLabel(activeRepo),
    };
  }

  async submitProposal(input: unknown) {
    const parsed = submitProposalInputSchema.parse(input);
    const activeRepo = await this.requireInitializedRepo();
    const record = proposalRecordSchema.parse({
      type: "proposal",
      ...parsed,
      created_at: new Date().toISOString(),
    });

    const result = await this.writeInboxRecord(activeRepo, record, {
      actor: parsed.author,
      action: "submit_proposal",
      operation: `proposal ${parsed.decision_id}`,
    });

    return {
      created: true,
      decision_id: parsed.decision_id,
      path: result.path,
      commit_sha: result.commitSha,
      active_repo: formatRepoLabel(activeRepo),
    };
  }

  async submitWorklog(input: unknown) {
    const parsed = submitWorklogInputSchema.parse(input);
    const activeRepo = await this.requireInitializedRepo();
    const record = worklogRecordSchema.parse({
      type: "worklog",
      ...parsed,
      created_at: new Date().toISOString(),
    });

    const result = await this.writeInboxRecord(activeRepo, record, {
      actor: parsed.author,
      action: "submit_worklog",
      operation: "worklog",
    });

    return {
      created: true,
      path: result.path,
      commit_sha: result.commitSha,
      active_repo: formatRepoLabel(activeRepo),
    };
  }

  async submitReview(input: unknown) {
    const parsed = submitReviewInputSchema.parse(input);
    const activeRepo = await this.requireInitializedRepo();
    const record = reviewRecordSchema.parse({
      type: "review",
      ...parsed,
      created_at: new Date().toISOString(),
    });

    const result = await this.writeInboxRecord(activeRepo, record, {
      actor: parsed.author,
      action: "submit_review",
      operation: `review ${parsed.decision_id}`,
    });

    return {
      created: true,
      decision_id: parsed.decision_id,
      path: result.path,
      commit_sha: result.commitSha,
      active_repo: formatRepoLabel(activeRepo),
    };
  }

  async searchContext(input: unknown) {
    const parsed = searchContextInputSchema.parse(input);
    const activeRepo = await this.requireInitializedRepo();
    const snapshot = await this.loader.loadSnapshot(activeRepo);
    const index = await this.requireIndex(activeRepo);
    const query = parsed.query.trim().toLowerCase();
    const normalizedDecisionId =
      parsed.query.trim().toUpperCase().startsWith("DEC-")
        ? parsed.query.trim().toUpperCase()
        : null;

    const candidatePaths = new Set<string>();

    for (const decision of [
      ...index.active_decisions,
      ...index.approved_decisions,
    ]) {
      if (
        decision.id === normalizedDecisionId ||
        decision.title.toLowerCase().includes(query) ||
        decision.topics.some((topic) => topic.toLowerCase().includes(query))
      ) {
        candidatePaths.add(decision.file);
      }
    }

    for (const [topic, decisionIds] of Object.entries(index.topics)) {
      if (
        topic.toLowerCase().includes(query) ||
        decisionIds.includes(normalizedDecisionId ?? "")
      ) {
        candidatePaths.add(`topics/${slugify(topic)}.md`);
      }
    }

    for (const [summaryName, summaryPath] of Object.entries(index.summaries)) {
      if (summaryName.toLowerCase().includes(query)) {
        candidatePaths.add(summaryPath);
      }
    }

    const matches = await this.loader.loadFiles(activeRepo, Array.from(candidatePaths));

    return {
      active_repo: formatRepoLabel(activeRepo),
      snapshot,
      matched_files: matches,
    };
  }

  async consolidateContext(input: unknown) {
    const parsed = consolidateContextInputSchema.parse(input);
    const activeRepo = await this.requireInitializedRepo();
    const index = await this.requireIndex(activeRepo);
    const config = await this.loadConfigOrDefault(activeRepo, index.project);
    const inboxEntries = await this.loadInboxRecords(activeRepo);
    const approvedBy = parsed.approved_by ?? this.options.defaultActor;
    const now = new Date().toISOString();

    const plan = this.consolidator.build({
      projectName: config.project_name,
      currentIndex: index,
      inboxEntries,
      approveDecisionIds: parsed.approve_decision_ids,
      approvedBy,
      now,
    });

    if (!parsed.apply) {
      return {
        active_repo: formatRepoLabel(activeRepo),
        summary: plan.summary,
        updated_files: plan.updatedFiles.map((file) => file.path),
        needs_human_approval: true,
      };
    }

    const updatedFiles: string[] = [];
    for (const file of plan.updatedFiles) {
      await this.upsertTextFile(activeRepo, file.path, file.content, {
        operation: `consolidate ${file.path}`,
      });
      updatedFiles.push(file.path);
    }

    await this.appendAuditLine(activeRepo, {
      timestamp: now,
      actor: approvedBy,
      action: "consolidate_context",
      path: `${AI_CONTEXT_DIR}/snapshot.md`,
      commit: "pending",
    });

    return {
      active_repo: formatRepoLabel(activeRepo),
      summary: plan.summary,
      updated_files: updatedFiles,
      needs_human_approval: false,
    };
  }

  async getDecision(input: unknown) {
    const parsed = getDecisionInputSchema.parse(input);
    const activeRepo = await this.requireInitializedRepo();
    const index = await this.requireIndex(activeRepo);
    const matched = [...index.active_decisions, ...index.approved_decisions].find(
      (entry) => entry.id === parsed.decision_id,
    );

    let relativePath = matched?.file;
    if (!relativePath) {
      const files = await this.options.repository.listDirectory(
        activeRepo,
        buildAiContextPath("decisions"),
        activeRepo.branch,
      );
      relativePath = files
        .map((entry) => entry.path)
        .find((path) => extractDecisionIdFromPath(path) === parsed.decision_id);
    }

    if (!relativePath) {
      throw new Error(`Decision ${parsed.decision_id} was not found.`);
    }

    const content = await this.loader.loadFile(activeRepo, relativePath);
    if (!content) {
      throw new Error(`Decision ${parsed.decision_id} was not found.`);
    }

    return {
      active_repo: formatRepoLabel(activeRepo),
      decision_id: parsed.decision_id,
      path: relativePath.startsWith(AI_CONTEXT_DIR)
        ? relativePath
        : buildAiContextPath(relativePath),
      content,
    };
  }

  async resetActiveRepo() {
    const previous = this.options.repoStore.reset();

    return {
      reset: true,
      previous_active_repo: previous ? formatRepoLabel(previous) : null,
    };
  }

  private async captureDecisionFromGeneric(input: CaptureContextInput) {
    const content = createDecisionInputSchema.parse({
      title: input.content.title,
      context: input.content.context ?? "",
      created_by: input.author,
      topics: input.content.topics ?? [],
    });

    return this.createDecision(content);
  }

  private async submitQuestion(input: CaptureContextInput) {
    const activeRepo = await this.requireInitializedRepo();
    const record = questionRecordSchema.parse({
      type: "question",
      author: input.author,
      question: input.content.question,
      related_topics: input.content.related_topics ?? [],
      status: input.content.status ?? "open",
      created_at: new Date().toISOString(),
    });

    const result = await this.writeInboxRecord(activeRepo, record, {
      actor: input.author,
      action: "submit_question",
      operation: "question",
    });

    return {
      created: true,
      path: result.path,
      commit_sha: result.commitSha,
      active_repo: formatRepoLabel(activeRepo),
    };
  }

  private async resolveOrSetRepo(repoInput?: string): Promise<ActiveRepoContext> {
    if (!repoInput) {
      return this.options.repoStore.require();
    }

    const repoRef = normalizeRepoReference(repoInput);
    const repoInfo = await this.options.repository.getRepository(repoRef);
    return this.options.repoStore.set({
      ...repoRef,
      branch: repoInfo.defaultBranch || this.options.defaultBranch,
    });
  }

  private async requireInitializedRepo(): Promise<ActiveRepoContext> {
    const repo = this.options.repoStore.require();
    const snapshot = await this.loader.loadSnapshot(repo);
    if (!snapshot) {
      throw new Error(
        `DCP is not initialized in ${formatRepoLabel(repo)}. Call init_dcp first.`,
      );
    }

    return repo;
  }

  private async initializeAiContextFiles(
    repo: ActiveRepoContext,
    projectName: string,
    now: string,
  ): Promise<string[]> {
    const files = [
      {
        path: buildAiContextPath("DCP.md"),
        content: renderDcpDocument(),
      },
      {
        path: buildAiContextPath("snapshot.md"),
        content: renderInitialSnapshot(projectName),
      },
      {
        path: buildAiContextPath("index.json"),
        content: renderInitialIndex(projectName, now),
      },
      {
        path: buildAiContextPath("config.json"),
        content: renderInitialConfig(
          projectName,
          repo.branch,
          this.options.maxFilesPerInteraction,
          this.options.maxContextTokens,
        ),
      },
      ...DCP_DIRECTORIES.map((directory) => ({
        path:
          directory === "audit"
            ? buildAiContextPath("audit", "audit-log.jsonl")
            : buildAiContextPath(directory, ".gitkeep"),
        content:
          directory === "audit"
            ? ""
            : `# Keep ${directory} tracked in Git.\n`,
      })),
      {
        path: buildAiContextPath("summaries", "project-summary.md"),
        content: `# Project Summary - ${projectName}\n\n- No consolidated content yet.\n`,
      },
    ];

    const createdFiles: string[] = [];
    for (const file of files) {
      const existing = await this.options.repository.readTextFile(repo, file.path, repo.branch);
      if (!existing) {
        await this.upsertTextFile(repo, file.path, file.content, {
          operation: `init ${file.path}`,
        });
        createdFiles.push(file.path);
      }
    }

    return createdFiles;
  }

  private async loadConfigOrDefault(
    repo: ActiveRepoContext,
    fallbackProjectName: string,
  ): Promise<ConfigFile> {
    const config = await this.loader.loadConfig(repo);
    if (config) {
      return config;
    }

    return configSchema.parse({
      project_name: fallbackProjectName,
      default_context_budget_tokens: this.options.maxContextTokens,
      max_files_per_interaction: this.options.maxFilesPerInteraction,
      require_human_confirmation_for_decisions: true,
      auto_capture_worklog: false,
      auto_update_snapshot_on_consolidate: true,
      repo_mode: this.options.repository.getStatus().effective_mode,
      active_branch: repo.branch,
      inbox_mode: "append-only",
    });
  }

  private async requireIndex(repo: ActiveRepoContext): Promise<IndexFile> {
    const index = await this.loader.loadIndex(repo);
    if (!index) {
      throw new Error(
        `Missing ${buildAiContextPath("index.json")} in ${formatRepoLabel(repo)}.`,
      );
    }

    return index;
  }

  private async listInboxFiles(repo: ActiveRepoContext): Promise<string[]> {
    const files = await this.options.repository.listDirectory(
      repo,
      buildAiContextPath("inbox"),
      repo.branch,
    );

    return files.filter((entry) => entry.name.endsWith(".json")).map((entry) => entry.path);
  }

  private async loadInboxRecords(repo: ActiveRepoContext): Promise<InboxRecord[]> {
    const files = await this.listInboxFiles(repo);
    const records: InboxRecord[] = [];

    for (const path of files) {
      const file = await this.options.repository.readTextFile(repo, path, repo.branch);
      if (!file) {
        continue;
      }

      records.push(inboxRecordSchema.parse(JSON.parse(file.content)));
    }

    return records.sort((left, right) => left.created_at.localeCompare(right.created_at));
  }

  private async getNextDecisionId(repo: ActiveRepoContext): Promise<string> {
    const index = await this.loader.loadIndex(repo);
    const existingIds = new Set<string>();

    for (const decision of [
      ...(index?.active_decisions ?? []),
      ...(index?.approved_decisions ?? []),
    ]) {
      existingIds.add(decision.id);
    }

    const decisionFiles = await this.options.repository.listDirectory(
      repo,
      buildAiContextPath("decisions"),
      repo.branch,
    );
    for (const file of decisionFiles) {
      const extracted = extractDecisionIdFromPath(file.path);
      if (extracted) {
        existingIds.add(extracted);
      }
    }

    const inboxRecords = await this.loadInboxRecords(repo);
    for (const record of inboxRecords) {
      if ("decision_id" in record) {
        existingIds.add(record.decision_id);
      }
    }

    const nextNumber =
      Math.max(0, ...Array.from(existingIds).map((decisionId) => decisionIdToNumber(decisionId))) +
      1;

    return `DEC-${String(nextNumber).padStart(3, "0")}`;
  }

  private async writeInboxRecord(
    repo: ActiveRepoContext,
    record: InboxRecord,
    params: {
      actor: string;
      action: string;
      operation: string;
    },
  ): Promise<{ path: string; commitSha: string }> {
    const payload = `${JSON.stringify(record, null, 2)}\n`;
    const filename = buildInboxFilename(
      record.created_at,
      params.actor,
      record.type,
      payload,
    );
    const path = buildAiContextPath("inbox", filename);
    const commitSha = await this.options.repository.writeTextFile({
      repo,
      path,
      content: payload,
      message: `feat(dcp): ${params.operation}`,
      branch: repo.branch,
    });

    await this.appendAuditLine(repo, {
      timestamp: record.created_at,
      actor: params.actor,
      action: params.action,
      path,
      commit: commitSha,
    });

    return { path, commitSha };
  }

  private async upsertTextFile(
    repo: ActiveRepoContext,
    path: string,
    content: string,
    params: { operation: string },
  ): Promise<string> {
    const existing = await this.options.repository.readTextFile(repo, path, repo.branch);

    try {
      return await this.options.repository.writeTextFile({
        repo,
        path,
        content,
        message: `chore(dcp): ${params.operation}`,
        branch: repo.branch,
        sha: existing?.sha,
      });
    } catch (error) {
      if (!this.options.repository.isConflictError(error)) {
        throw error;
      }

      const refreshed = await this.options.repository.readTextFile(repo, path, repo.branch);
      try {
        return await this.options.repository.writeTextFile({
          repo,
          path,
          content,
          message: `chore(dcp): ${params.operation}`,
          branch: repo.branch,
          sha: refreshed?.sha,
        });
      } catch (secondError) {
        await this.persistConflict(repo, path, content, params.operation, secondError);
        throw secondError;
      }
    }
  }

  private async persistConflict(
    repo: ActiveRepoContext,
    targetPath: string,
    payload: string,
    operation: string,
    error: unknown,
  ): Promise<void> {
    const record = {
      type: "conflict_pending" as const,
      author: this.options.defaultActor,
      target_path: targetPath,
      operation,
      payload,
      error: error instanceof Error ? error.message : String(error),
      created_at: new Date().toISOString(),
    };

    const filename = buildInboxFilename(
      record.created_at,
      record.author,
      record.type,
      JSON.stringify(record),
    );

    await this.options.repository.writeTextFile({
      repo,
      path: buildAiContextPath("inbox", filename),
      content: `${JSON.stringify(record, null, 2)}\n`,
      message: `chore(dcp): capture conflict for ${operation}`,
      branch: repo.branch,
    });
  }

  private async appendAuditLine(
    repo: ActiveRepoContext,
    entry: Record<string, string>,
  ): Promise<void> {
    const path = buildAiContextPath("audit", "audit-log.jsonl");
    const current = await this.options.repository.readTextFile(repo, path, repo.branch);
    const line = `${JSON.stringify(entry)}\n`;
    const content = `${current?.content ?? ""}${line}`;

    await this.options.repository.writeTextFile({
      repo,
      path,
      content,
      message: `chore(dcp): append audit log`,
      branch: repo.branch,
      sha: current?.sha,
    });
  }
}
