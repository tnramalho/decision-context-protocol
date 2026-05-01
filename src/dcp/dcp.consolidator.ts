import {
  buildAiContextPath,
  buildDailyWorklogFilename,
  buildDecisionRelativePath,
  decisionIdToNumber,
  extractDecisionIdFromPath,
  slugify,
} from "../github/github.files.js";
import {
  renderDailyWorklog,
  renderDecisionMarkdown,
  renderIndex,
  renderProjectSummary,
  renderReviewSummary,
  renderSnapshot,
  renderTopicSummary,
} from "./dcp.templates.js";
import type {
  InboxRecord,
  IndexDecisionEntry,
  IndexFile,
  ProposalRecord,
  QuestionRecord,
  ReviewRecord,
  WorklogRecord,
} from "./dcp.schemas.js";

interface DecisionAggregate {
  id: string;
  title: string;
  status: IndexDecisionEntry["status"];
  context: string;
  decision: string;
  why: string;
  alternatives: Set<string>;
  tradeoffs: Set<string>;
  topics: Set<string>;
  participants: Set<string>;
  createdAt: string;
  file: string;
  proposals: ProposalRecord[];
  reviews: ReviewRecord[];
  worklogs: WorklogRecord[];
}

export interface ConsolidationPlan {
  summary: string;
  updatedFiles: Array<{ path: string; content: string }>;
  index: IndexFile;
}

export class DcpConsolidator {
  build(params: {
    projectName: string;
    currentIndex: IndexFile | null;
    inboxEntries: InboxRecord[];
    approveDecisionIds: string[];
    approvedBy: string;
    now: string;
  }): ConsolidationPlan {
    const decisionMap = new Map<string, DecisionAggregate>();
    const currentDecisionEntries = [
      ...(params.currentIndex?.active_decisions ?? []),
      ...(params.currentIndex?.approved_decisions ?? []),
    ];
    const currentDecisionById = new Map(
      currentDecisionEntries.map((entry) => [entry.id, entry] as const),
    );

    for (const entry of currentDecisionEntries) {
      decisionMap.set(entry.id, {
        id: entry.id,
        title: entry.title,
        status: entry.status,
        context: "",
        decision: "",
        why: "",
        alternatives: new Set<string>(),
        tradeoffs: new Set<string>(),
        topics: new Set(entry.topics),
        participants: new Set<string>(),
        createdAt: params.now,
        file: entry.file,
        proposals: [],
        reviews: [],
        worklogs: [],
      });
    }

    const recentWorklogs: WorklogRecord[] = [];
    const openQuestions: QuestionRecord[] = [];
    const allReviews: ReviewRecord[] = [];

    for (const entry of params.inboxEntries) {
      switch (entry.type) {
        case "decision": {
          const existing = decisionMap.get(entry.decision_id);
          const aggregate = existing ?? {
            id: entry.decision_id,
            title: entry.title,
            status: entry.status,
            context: "",
            decision: "",
            why: "",
            alternatives: new Set<string>(),
            tradeoffs: new Set<string>(),
            topics: new Set<string>(),
            participants: new Set<string>(),
            createdAt: entry.created_at,
            file: buildDecisionRelativePath(entry.decision_id, entry.title),
            proposals: [],
            reviews: [],
            worklogs: [],
          };

          aggregate.title = entry.title;
          aggregate.status = entry.status;
          aggregate.context = entry.context;
          aggregate.decision = entry.decision;
          aggregate.why = entry.why;
          aggregate.createdAt = aggregate.createdAt || entry.created_at;
          aggregate.file = buildDecisionRelativePath(
            entry.decision_id,
            entry.title,
            existing?.file ?? currentDecisionById.get(entry.decision_id)?.file,
          );
          aggregate.participants.add(entry.created_by);
          for (const alternative of entry.alternatives) {
            aggregate.alternatives.add(alternative);
          }
          for (const tradeoff of entry.tradeoffs) {
            aggregate.tradeoffs.add(tradeoff);
          }
          for (const topic of entry.topics) {
            aggregate.topics.add(topic);
          }

          decisionMap.set(entry.decision_id, aggregate);
          break;
        }
        case "proposal": {
          const existing = decisionMap.get(entry.decision_id);
          const aggregate = existing ?? {
            id: entry.decision_id,
            title: currentDecisionById.get(entry.decision_id)?.title ?? entry.decision_id,
            status: currentDecisionById.get(entry.decision_id)?.status ?? "under_review",
            context: "",
            decision: "",
            why: "",
            alternatives: new Set<string>(),
            tradeoffs: new Set<string>(),
            topics: new Set<string>(),
            participants: new Set<string>(),
            createdAt: entry.created_at,
            file: buildDecisionRelativePath(
              entry.decision_id,
              currentDecisionById.get(entry.decision_id)?.title ?? entry.decision_id,
              currentDecisionById.get(entry.decision_id)?.file,
            ),
            proposals: [],
            reviews: [],
            worklogs: [],
          };

          aggregate.proposals.push(entry);
          aggregate.participants.add(entry.author);
          aggregate.decision ||= entry.proposal;
          aggregate.why ||= entry.why;
          for (const risk of entry.risks) {
            aggregate.tradeoffs.add(risk);
          }
          for (const alternative of entry.alternatives) {
            aggregate.alternatives.add(alternative);
          }
          for (const topic of entry.related_topics) {
            aggregate.topics.add(topic);
          }

          decisionMap.set(entry.decision_id, aggregate);
          break;
        }
        case "review": {
          const existing = decisionMap.get(entry.decision_id);
          const aggregate = existing ?? {
            id: entry.decision_id,
            title: currentDecisionById.get(entry.decision_id)?.title ?? entry.decision_id,
            status: currentDecisionById.get(entry.decision_id)?.status ?? "under_review",
            context: "",
            decision: "",
            why: "",
            alternatives: new Set<string>(),
            tradeoffs: new Set<string>(),
            topics: new Set<string>(),
            participants: new Set<string>(),
            createdAt: entry.created_at,
            file: buildDecisionRelativePath(
              entry.decision_id,
              currentDecisionById.get(entry.decision_id)?.title ?? entry.decision_id,
              currentDecisionById.get(entry.decision_id)?.file,
            ),
            proposals: [],
            reviews: [],
            worklogs: [],
          };

          aggregate.reviews.push(entry);
          aggregate.participants.add(entry.author);
          aggregate.tradeoffs.add(entry.concern);
          decisionMap.set(entry.decision_id, aggregate);
          allReviews.push(entry);
          break;
        }
        case "worklog": {
          recentWorklogs.push(entry);
          for (const decisionId of entry.decisions_referenced) {
            const aggregate = decisionMap.get(decisionId);
            if (aggregate) {
              aggregate.worklogs.push(entry);
              aggregate.participants.add(entry.author);
            }
          }
          break;
        }
        case "question": {
          openQuestions.push(entry);
          break;
        }
        case "conflict_pending":
          break;
      }
    }

    const approvedSet = new Set(params.approveDecisionIds);
    const aggregatedDecisions = Array.from(decisionMap.values()).sort(
      (left, right) => decisionIdToNumber(left.id) - decisionIdToNumber(right.id),
    );

    const updatedFiles: Array<{ path: string; content: string }> = [];
    const activeDecisions: IndexDecisionEntry[] = [];
    const approvedDecisions: IndexDecisionEntry[] = [];
    const topicMap = new Map<string, IndexDecisionEntry[]>();

    for (const decision of aggregatedDecisions) {
      if (approvedSet.has(decision.id)) {
        decision.status = "approved";
      }

      const entry: IndexDecisionEntry = {
        id: decision.id,
        title: decision.title,
        file: decision.file,
        status: decision.status,
        topics: Array.from(decision.topics).sort(),
      };

      if (decision.status === "approved") {
        approvedDecisions.push(entry);
      } else {
        activeDecisions.push(entry);
      }

      for (const topic of entry.topics) {
        const list = topicMap.get(topic) ?? [];
        list.push(entry);
        topicMap.set(topic, list);
      }

      updatedFiles.push({
        path: buildAiContextPath(entry.file),
        content: renderDecisionMarkdown({
          id: decision.id,
          title: decision.title,
          status: decision.status,
          decision: decision.decision || "Pending human confirmation.",
          context: decision.context,
          why: decision.why || "Awaiting a consolidated rationale.",
          alternatives: Array.from(decision.alternatives),
          tradeoffs: Array.from(decision.tradeoffs),
          proposals: decision.proposals,
          reviews: decision.reviews,
          participants: Array.from(decision.participants).sort(),
          createdAt: decision.createdAt,
          consolidatedAt: params.now,
          consolidatedBy: params.approvedBy,
          topics: Array.from(decision.topics).sort(),
        }),
      });

      if (decision.reviews.length > 0) {
        updatedFiles.push({
          path: buildAiContextPath("reviews", `${decision.id}-${slugify(decision.title)}.md`),
          content: renderReviewSummary({
            decisionId: decision.id,
            reviews: decision.reviews,
          }),
        });
      }
    }

    for (const [topic, decisions] of topicMap.entries()) {
      updatedFiles.push({
        path: buildAiContextPath("topics", `${slugify(topic)}.md`),
        content: renderTopicSummary({
          topic,
          decisions,
        }),
      });
    }

    const worklogsByDayAndAuthor = new Map<string, WorklogRecord[]>();
    for (const worklog of recentWorklogs) {
      const date = worklog.created_at.slice(0, 10);
      const key = `${date}:${worklog.author}`;
      const list = worklogsByDayAndAuthor.get(key) ?? [];
      list.push(worklog);
      worklogsByDayAndAuthor.set(key, list);
    }

    for (const [key, worklogs] of worklogsByDayAndAuthor.entries()) {
      const [date, author] = key.split(":");
      updatedFiles.push({
        path: buildAiContextPath("worklogs", buildDailyWorklogFilename(date, author)),
        content: renderDailyWorklog({
          date,
          author,
          worklogs,
        }),
      });
    }

    const nextSteps = recentWorklogs
      .flatMap((entry) => entry.next_steps)
      .filter(Boolean)
      .slice(-5);
    const risks = [
      ...allReviews.map((entry) => entry.concern),
      ...aggregatedDecisions.flatMap((entry) => Array.from(entry.tradeoffs)),
    ].slice(-5);

    updatedFiles.push({
      path: buildAiContextPath("summaries", "project-summary.md"),
      content: renderProjectSummary({
        projectName: params.projectName,
        approvedDecisions,
        activeDecisions,
        recentWorklogs,
        openQuestions,
        reviews: allReviews,
      }),
    });

    updatedFiles.push({
      path: buildAiContextPath("snapshot.md"),
      content: renderSnapshot({
        projectName: params.projectName,
        approvedDecisions,
        activeDecisions,
        recentWorklogs,
        nextSteps,
        risks,
        currentState: [
          `Tracking ${approvedDecisions.length + activeDecisions.length} consolidated decisions.`,
          `Approved decisions: ${approvedDecisions.length}.`,
          `Decisions under review: ${activeDecisions.length}.`,
        ],
      }),
    });

    const index: IndexFile = {
      version: "0.1",
      project: params.projectName,
      active_decisions: activeDecisions,
      approved_decisions: approvedDecisions,
      topics: Object.fromEntries(
        Array.from(topicMap.entries()).map(([topic, decisions]) => [
          topic,
          decisions.map((decision) => decision.id),
        ]),
      ),
      summaries: {
        project: "summaries/project-summary.md",
      },
      last_updated_at: params.now,
    };

    updatedFiles.push({
      path: buildAiContextPath("index.json"),
      content: renderIndex(index),
    });

    const decisionPreview = aggregatedDecisions.length
      ? aggregatedDecisions
          .map((entry) => `${entry.id} (${approvedSet.has(entry.id) ? "approved" : entry.status})`)
          .join(", ")
      : "no decisions found";

    return {
      summary: `Consolidation prepared for ${decisionPreview}. ${recentWorklogs.length} worklogs and ${openQuestions.length} questions were considered.`,
      updatedFiles,
      index,
    };
  }
}
