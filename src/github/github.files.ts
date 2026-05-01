import { createHash } from "node:crypto";

export interface RepoCoordinates {
  owner: string;
  repo: string;
}

export const AI_CONTEXT_DIR = ".ai-context";

export const DCP_DIRECTORIES = [
  "inbox",
  "decisions",
  "summaries",
  "worklogs",
  "reviews",
  "topics",
  "audit",
] as const;

export function normalizeRepoReference(input: string): RepoCoordinates {
  const cleaned = input
    .trim()
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/^github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");

  const match = cleaned.match(/^([^/]+)\/([^/]+)$/);
  if (!match) {
    throw new Error(
      `Invalid repository reference "${input}". Expected "owner/repo" or "github.com/owner/repo".`,
    );
  }

  return {
    owner: match[1],
    repo: match[2],
  };
}

export function formatRepoLabel(repo: RepoCoordinates): string {
  return `${repo.owner}/${repo.repo}`;
}

export function buildAiContextPath(...parts: string[]): string {
  return [AI_CONTEXT_DIR, ...parts].join("/");
}

export function ensureAiContextPath(path: string): string {
  if (path.startsWith(`${AI_CONTEXT_DIR}/`)) {
    return path;
  }

  return buildAiContextPath(path);
}

export function slugify(value: string): string {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "item";
}

export function toSafeTimestamp(value: string): string {
  return value.replace(/:/g, "-").replace(/\.\d{3}Z$/, "Z");
}

export function shortHash(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 8);
}

export function decisionIdToNumber(decisionId: string): number {
  const match = decisionId.toUpperCase().match(/^DEC-(\d{3,})$/);
  return match ? Number(match[1]) : 0;
}

export function buildDecisionRelativePath(
  decisionId: string,
  title: string,
  existingRelativePath?: string,
): string {
  if (existingRelativePath) {
    return existingRelativePath;
  }

  return `decisions/${decisionId}-${slugify(title)}.md`;
}

export function extractDecisionIdFromPath(path: string): string | null {
  const match = path.match(/(DEC-\d{3,})/i);
  return match ? match[1].toUpperCase() : null;
}

export function buildInboxFilename(
  timestamp: string,
  author: string,
  type: string,
  payload: string,
): string {
  return `${toSafeTimestamp(timestamp)}_${slugify(author)}_${slugify(type)}_${shortHash(payload)}.json`;
}

export function buildDailyWorklogFilename(date: string, author: string): string {
  return `${date}-${slugify(author)}.md`;
}
