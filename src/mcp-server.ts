import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";

import { DcpService } from "./dcp/dcp.service.js";
import {
  captureContextInputSchema,
  consolidateContextInputSchema,
  createDecisionInputSchema,
  getRepositoryBackendInputSchema,
  getDecisionInputSchema,
  initDcpInputSchema,
  searchContextInputSchema,
  setRepositoryBackendInputSchema,
  setActiveRepoInputSchema,
  submitProposalInputSchema,
  submitReviewInputSchema,
  submitWorklogInputSchema,
} from "./dcp/dcp.schemas.js";

function toTextResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function toErrorResult(error: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: error instanceof Error ? error.message : String(error),
      },
    ],
    isError: true,
  };
}

function registerJsonTool<Shape extends z.ZodRawShape>(
  server: McpServer,
  name: string,
  description: string,
  inputSchema: Shape,
  handler: (args: Record<string, unknown>) => Promise<unknown>,
) {
  const registerTool = server.registerTool.bind(server) as (
    toolName: string,
    config: {
      description: string;
      inputSchema: Shape;
    },
    callback: (args: Record<string, unknown>) => Promise<{
      content: Array<{ type: "text"; text: string }>;
      isError?: boolean;
    }>,
  ) => unknown;

  registerTool(
    name,
    {
      description,
      inputSchema,
    },
    async (args) => {
      try {
        return toTextResult(await handler(args as Record<string, unknown>));
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );
}

export function createMcpServer(service: DcpService): McpServer {
  const server = new McpServer(
    {
      name: "dcp",
      version: "0.1.0",
    },
    {
      capabilities: {
        logging: {},
      },
    },
  );

  registerJsonTool(
    server,
    "set_active_repo",
    "Set the active GitHub repository for the current DCP session.",
    setActiveRepoInputSchema.shape,
    async (args) => service.setActiveRepo(args),
  );

  registerJsonTool(
    server,
    "init_dcp",
    "Initialize .ai-context in the active repository or a provided repository.",
    initDcpInputSchema.shape,
    async (args) => service.initDcp(args),
  );

  registerJsonTool(
    server,
    "get_status",
    "Read the current DCP status for the active repository.",
    {},
    async () => service.getStatus(),
  );

  registerJsonTool(
    server,
    "capture_context",
    "Capture a structured context record into the append-only inbox.",
    captureContextInputSchema.shape,
    async (args) => service.captureContext(args),
  );

  registerJsonTool(
    server,
    "create_decision",
    "Create a new decision record in the DCP inbox with under_review status.",
    createDecisionInputSchema.shape,
    async (args) => service.createDecision(args),
  );

  registerJsonTool(
    server,
    "submit_proposal",
    "Submit a proposal linked to an existing decision id.",
    submitProposalInputSchema.shape,
    async (args) => service.submitProposal(args),
  );

  registerJsonTool(
    server,
    "submit_worklog",
    "Submit a worklog entry for handoff and continuity.",
    submitWorklogInputSchema.shape,
    async (args) => service.submitWorklog(args),
  );

  registerJsonTool(
    server,
    "submit_review",
    "Submit a review against an existing decision.",
    submitReviewInputSchema.shape,
    async (args) => service.submitReview(args),
  );

  registerJsonTool(
    server,
    "search_context",
    "Search the active DCP context using snapshot-first loading and a small file budget.",
    searchContextInputSchema.shape,
    async (args) => service.searchContext(args),
  );

  registerJsonTool(
    server,
    "consolidate_context",
    "Preview or apply a consolidation that rewrites decisions, summaries, snapshot, index and audit.",
    consolidateContextInputSchema.shape,
    async (args) => service.consolidateContext(args),
  );

  registerJsonTool(
    server,
    "get_decision",
    "Read one consolidated decision file by id.",
    getDecisionInputSchema.shape,
    async (args) => service.getDecision(args),
  );

  registerJsonTool(
    server,
    "get_repository_backend",
    "Inspect the current repository backend selection and availability.",
    getRepositoryBackendInputSchema.shape,
    async (args) => service.getRepositoryBackend(args),
  );

  registerJsonTool(
    server,
    "set_repository_backend",
    "Choose which repository backend DCP should use in this session.",
    setRepositoryBackendInputSchema.shape,
    async (args) => service.setRepositoryBackend(args),
  );

  registerJsonTool(
    server,
    "reset_active_repo",
    "Reset the active repository for the current session.",
    {},
    async () => service.resetActiveRepo(),
  );

  return server;
}
