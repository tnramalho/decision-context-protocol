import type {
  ConfigFile,
  IndexDecisionEntry,
  IndexFile,
  ProposalRecord,
  QuestionRecord,
  ReviewRecord,
  WorklogRecord,
} from "./dcp.schemas.js";

function renderBulletList(items: string[], fallback: string): string {
  if (items.length === 0) {
    return `- ${fallback}`;
  }

  return items.map((item) => `- ${item}`).join("\n");
}

export function renderDcpDocument(): string {
  return `# Decision Context Protocol

Este projeto usa DCP para registrar decisoes, progresso e contexto tecnico compartilhado.

## Regras

1. Sempre ler \`snapshot.md\` primeiro.
2. Nao carregar o repositorio inteiro.
3. Novas contribuicoes devem ir para \`inbox/\`.
4. Decisoes oficiais devem ficar em \`decisions/\`.
5. Nada vira decisao oficial sem confirmacao humana.
6. Uma sessao deve usar apenas um repo ativo.
7. Contribuicoes sao append-only por padrao.
8. Consolidacao so acontece com comando explicito.
`;
}

export function renderInitialSnapshot(projectName: string): string {
  return `# Snapshot - ${projectName}

## Current state
- DCP initialized.
- No consolidated decisions yet.

## Approved decisions
- None yet.

## Decisions under review
- None yet.

## Latest worklogs
- No worklogs captured yet.

## Next steps
- Create the first decision.
- Capture the first worklog.
- Consolidate when ready.

## Risks
- Snapshot growing too much.
- Inbox accumulating without consolidation.
`;
}

export function renderInitialIndex(projectName: string, timestamp: string): string {
  const index: IndexFile = {
    version: "0.1",
    project: projectName,
    active_decisions: [],
    approved_decisions: [],
    topics: {},
    summaries: {
      project: "summaries/project-summary.md",
    },
    last_updated_at: timestamp,
  };

  return renderIndex(index);
}

export function renderInitialConfig(
  projectName: string,
  branch: string,
  maxFilesPerInteraction: number,
  maxContextTokens: number,
): string {
  const config: ConfigFile = {
    project_name: projectName,
    default_context_budget_tokens: maxContextTokens,
    max_files_per_interaction: maxFilesPerInteraction,
    require_human_confirmation_for_decisions: true,
    auto_capture_worklog: false,
    auto_update_snapshot_on_consolidate: true,
    repo_mode: "github-api",
    active_branch: branch,
    inbox_mode: "append-only",
  };

  return `${JSON.stringify(config, null, 2)}\n`;
}

export function renderIndex(index: IndexFile): string {
  return `${JSON.stringify(index, null, 2)}\n`;
}

export function renderProjectSummary(params: {
  projectName: string;
  approvedDecisions: IndexDecisionEntry[];
  activeDecisions: IndexDecisionEntry[];
  recentWorklogs: WorklogRecord[];
  openQuestions: QuestionRecord[];
  reviews: ReviewRecord[];
}): string {
  const latestWorklogs = params.recentWorklogs
    .slice(-5)
    .reverse()
    .map((entry) => `${entry.author}: ${entry.done.join("; ") || "No completed items recorded."}`);

  const questions = params.openQuestions
    .slice(-5)
    .reverse()
    .map((entry) => `${entry.author}: ${entry.question}`);

  const reviewNotes = params.reviews
    .slice(-5)
    .reverse()
    .map((entry) => `${entry.decision_id}: ${entry.concern}`);

  return `# Project Summary - ${params.projectName}

## Decisions
- Approved: ${params.approvedDecisions.length}
- Under review: ${params.activeDecisions.length}

## Approved decisions
${renderBulletList(
  params.approvedDecisions.map((decision) => `${decision.id} - ${decision.title}`),
  "No approved decisions yet.",
)}

## Decisions under review
${renderBulletList(
  params.activeDecisions.map((decision) => `${decision.id} - ${decision.title}`),
  "No active decisions under review.",
)}

## Latest worklogs
${renderBulletList(latestWorklogs, "No worklogs captured yet.")}

## Open questions
${renderBulletList(questions, "No open questions.")}

## Latest reviews
${renderBulletList(reviewNotes, "No reviews captured yet.")}
`;
}

export function renderTopicSummary(params: {
  topic: string;
  decisions: IndexDecisionEntry[];
}): string {
  return `# Topic - ${params.topic}

## Related decisions
${renderBulletList(
  params.decisions.map((decision) => `${decision.id} - ${decision.title} (${decision.status})`),
  "No decisions linked to this topic.",
)}
`;
}

export function renderReviewSummary(params: {
  decisionId: string;
  reviews: ReviewRecord[];
}): string {
  return `# Reviews - ${params.decisionId}

${renderBulletList(
  params.reviews.map(
    (review) =>
      `${review.author}: ${review.concern}. Suggested change: ${review.suggested_change}. Impact: ${review.impact}`,
  ),
  "No reviews captured yet.",
)}
`;
}

export function renderDailyWorklog(params: {
  date: string;
  author: string;
  worklogs: WorklogRecord[];
}): string {
  const done = params.worklogs.flatMap((entry) => entry.done);
  const nextSteps = params.worklogs.flatMap((entry) => entry.next_steps);
  const blockers = params.worklogs.flatMap((entry) => entry.blockers);
  const notes = params.worklogs.map((entry) => entry.notes).filter(Boolean);

  return `# Worklog - ${params.author} - ${params.date}

## Done
${renderBulletList(done, "No completed items recorded.")}

## Next steps
${renderBulletList(nextSteps, "No next steps captured.")}

## Blockers
${renderBulletList(blockers, "No blockers recorded.")}

## Notes
${renderBulletList(notes, "No extra notes recorded.")}
`;
}

export function renderSnapshot(params: {
  projectName: string;
  approvedDecisions: IndexDecisionEntry[];
  activeDecisions: IndexDecisionEntry[];
  recentWorklogs: WorklogRecord[];
  nextSteps: string[];
  risks: string[];
  currentState: string[];
}): string {
  const latestWorklogs = params.recentWorklogs
    .slice(-3)
    .reverse()
    .map(
      (entry) =>
        `${entry.author}: ${entry.done[0] ?? (entry.notes || "Worklog captured.")}`,
    );

  return `# Snapshot - ${params.projectName}

## Current state
${renderBulletList(params.currentState, "DCP initialized and waiting for the first contribution.")}

## Approved decisions
${renderBulletList(
  params.approvedDecisions.map((decision) => `${decision.id}: ${decision.title}.`),
  "None yet.",
)}

## Decisions under review
${renderBulletList(
  params.activeDecisions.map((decision) => `${decision.id}: ${decision.title}.`),
  "None yet.",
)}

## Latest worklogs
${renderBulletList(latestWorklogs, "No worklogs captured yet.")}

## Next steps
${renderBulletList(params.nextSteps, "No next steps recorded.")}

## Risks
${renderBulletList(params.risks, "No explicit risks recorded.")}
`;
}

export function renderDecisionMarkdown(params: {
  id: string;
  title: string;
  status: string;
  decision: string;
  context: string;
  why: string;
  alternatives: string[];
  tradeoffs: string[];
  proposals: ProposalRecord[];
  reviews: ReviewRecord[];
  participants: string[];
  createdAt: string;
  consolidatedAt: string;
  consolidatedBy: string;
  topics: string[];
}): string {
  const proposalsBlock = params.proposals
    .slice(-5)
    .reverse()
    .map((proposal) => `- ${proposal.author}: ${proposal.proposal}`)
    .join("\n");

  const reviewsBlock = params.reviews
    .slice(-5)
    .reverse()
    .map((review) => `- ${review.author}: ${review.concern} -> ${review.suggested_change}`)
    .join("\n");

  return `# ${params.id} - ${params.title}

## Status
${params.status}

## Decision
${params.decision}

## Context
${params.context || "Context not captured yet."}

## Why
${params.why || "Rationale not captured yet."}

## Alternatives evaluated
${renderBulletList(params.alternatives, "No alternatives captured.")}

## Trade-offs
${renderBulletList(params.tradeoffs, "No trade-offs captured.")}

## Topics
${renderBulletList(params.topics, "No topics assigned.")}

## Supporting proposals
${proposalsBlock || "- No proposals linked yet."}

## Reviews
${reviewsBlock || "- No reviews linked yet."}

## Participants
${renderBulletList(params.participants, "No participants recorded.")}

## Audit
- Created at: ${params.createdAt}
- Consolidated at: ${params.consolidatedAt}
- Consolidated by: ${params.consolidatedBy}
`;
}
