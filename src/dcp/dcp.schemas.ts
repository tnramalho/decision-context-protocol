import { z } from "zod";

export const decisionIdSchema = z
  .string()
  .regex(/^DEC-\d{3,}$/i, "Decision ids must look like DEC-001.")
  .transform((value) => value.toUpperCase());

export const decisionStatusSchema = z.enum([
  "under_review",
  "approved",
  "rejected",
  "superseded",
]);

export const decisionRecordSchema = z.object({
  type: z.literal("decision"),
  decision_id: decisionIdSchema,
  title: z.string().min(1),
  status: decisionStatusSchema.default("under_review"),
  context: z.string().default(""),
  decision: z.string().default("Pending human confirmation."),
  why: z.string().default("Pending human confirmation."),
  alternatives: z.array(z.string()).default([]),
  tradeoffs: z.array(z.string()).default([]),
  topics: z.array(z.string()).default([]),
  created_by: z.string().min(1),
  created_at: z.string().datetime(),
});

export const proposalRecordSchema = z.object({
  type: z.literal("proposal"),
  decision_id: decisionIdSchema,
  author: z.string().min(1),
  proposal: z.string().min(1),
  why: z.string().min(1),
  risks: z.array(z.string()).default([]),
  alternatives: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).optional(),
  related_topics: z.array(z.string()).default([]),
  created_at: z.string().datetime(),
});

export const worklogRecordSchema = z.object({
  type: z.literal("worklog"),
  author: z.string().min(1),
  done: z.array(z.string()).default([]),
  decisions_referenced: z.array(decisionIdSchema).default([]),
  next_steps: z.array(z.string()).default([]),
  blockers: z.array(z.string()).default([]),
  notes: z.string().default(""),
  created_at: z.string().datetime(),
});

export const reviewRecordSchema = z.object({
  type: z.literal("review"),
  decision_id: decisionIdSchema,
  author: z.string().min(1),
  concern: z.string().min(1),
  suggested_change: z.string().min(1),
  impact: z.string().min(1),
  created_at: z.string().datetime(),
});

export const questionRecordSchema = z.object({
  type: z.literal("question"),
  author: z.string().min(1),
  question: z.string().min(1),
  related_topics: z.array(z.string()).default([]),
  status: z.enum(["open", "answered"]).default("open"),
  created_at: z.string().datetime(),
});

export const conflictRecordSchema = z.object({
  type: z.literal("conflict_pending"),
  author: z.string().min(1),
  target_path: z.string().min(1),
  operation: z.string().min(1),
  payload: z.string().min(1),
  error: z.string().min(1),
  created_at: z.string().datetime(),
});

export const inboxRecordSchema = z.discriminatedUnion("type", [
  decisionRecordSchema,
  proposalRecordSchema,
  worklogRecordSchema,
  reviewRecordSchema,
  questionRecordSchema,
  conflictRecordSchema,
]);

export const indexDecisionEntrySchema = z.object({
  id: decisionIdSchema,
  title: z.string().min(1),
  file: z.string().min(1),
  status: decisionStatusSchema,
  topics: z.array(z.string()).default([]),
});

export const indexSchema = z.object({
  version: z.string().default("0.1"),
  project: z.string().min(1),
  active_decisions: z.array(indexDecisionEntrySchema).default([]),
  approved_decisions: z.array(indexDecisionEntrySchema).default([]),
  topics: z.record(z.string(), z.array(z.string())).default({}),
  summaries: z.record(z.string(), z.string()).default({}),
  last_updated_at: z.string().datetime(),
});

export const configSchema = z.object({
  project_name: z.string().min(1),
  default_context_budget_tokens: z.number().int().positive().default(2000),
  max_files_per_interaction: z.number().int().positive().default(3),
  require_human_confirmation_for_decisions: z.boolean().default(true),
  auto_capture_worklog: z.boolean().default(false),
  auto_update_snapshot_on_consolidate: z.boolean().default(true),
  repo_mode: z.string().default("github-api"),
  active_branch: z.string().default("main"),
  inbox_mode: z.string().default("append-only"),
});

export const repositoryBackendModeSchema = z.enum([
  "auto",
  "github-api",
  "github-mcp",
]);

export const githubMcpConfigSchema = z.object({
  transport: z.enum(["stdio", "http"]).optional(),
  command: z.string().min(1).optional(),
  args: z.array(z.string()).default([]).optional(),
  env: z.record(z.string(), z.string()).default({}).optional(),
  cwd: z.string().min(1).optional(),
  url: z.string().url().optional(),
  headers: z.record(z.string(), z.string()).default({}).optional(),
  auth_token: z.string().min(1).optional(),
});

export const setActiveRepoInputSchema = z.object({
  repo: z.string().min(3),
});

export const initDcpInputSchema = z.object({
  repo: z.string().min(3).optional(),
  project_name: z.string().min(1).optional(),
});

export const getStatusInputSchema = z.object({});

export const captureContextInputSchema = z.object({
  type: z.enum(["decision", "proposal", "worklog", "review", "question"]),
  author: z.string().min(1),
  content: z.record(z.string(), z.unknown()),
});

export const createDecisionInputSchema = z.object({
  title: z.string().min(1),
  context: z.string().default(""),
  created_by: z.string().min(1),
  topics: z.array(z.string()).default([]),
});

export const submitProposalInputSchema = z.object({
  decision_id: decisionIdSchema,
  author: z.string().min(1),
  proposal: z.string().min(1),
  why: z.string().min(1),
  risks: z.array(z.string()).default([]),
  alternatives: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).optional(),
  related_topics: z.array(z.string()).default([]),
});

export const submitWorklogInputSchema = z.object({
  author: z.string().min(1),
  done: z.array(z.string()).default([]),
  decisions_referenced: z.array(decisionIdSchema).default([]),
  next_steps: z.array(z.string()).default([]),
  blockers: z.array(z.string()).default([]),
  notes: z.string().default(""),
});

export const submitReviewInputSchema = z.object({
  decision_id: decisionIdSchema,
  author: z.string().min(1),
  concern: z.string().min(1),
  suggested_change: z.string().min(1),
  impact: z.string().min(1),
});

export const searchContextInputSchema = z.object({
  query: z.string().min(1),
});

export const consolidateContextInputSchema = z.object({
  scope: z.enum(["all"]).default("all"),
  apply: z.boolean().default(false),
  approve_decision_ids: z.array(decisionIdSchema).default([]),
  approved_by: z.string().min(1).optional(),
});

export const getDecisionInputSchema = z.object({
  decision_id: decisionIdSchema,
});

export const resetActiveRepoInputSchema = z.object({});

export const getRepositoryBackendInputSchema = z.object({});

export const setRepositoryBackendInputSchema = z.object({
  mode: repositoryBackendModeSchema,
  github_mcp: githubMcpConfigSchema.optional(),
});

export type DecisionRecord = z.infer<typeof decisionRecordSchema>;
export type ProposalRecord = z.infer<typeof proposalRecordSchema>;
export type WorklogRecord = z.infer<typeof worklogRecordSchema>;
export type ReviewRecord = z.infer<typeof reviewRecordSchema>;
export type QuestionRecord = z.infer<typeof questionRecordSchema>;
export type ConflictRecord = z.infer<typeof conflictRecordSchema>;
export type InboxRecord = z.infer<typeof inboxRecordSchema>;
export type IndexDecisionEntry = z.infer<typeof indexDecisionEntrySchema>;
export type IndexFile = z.infer<typeof indexSchema>;
export type ConfigFile = z.infer<typeof configSchema>;
export type CaptureContextInput = z.infer<typeof captureContextInputSchema>;
export type RepositoryBackendMode = z.infer<typeof repositoryBackendModeSchema>;
