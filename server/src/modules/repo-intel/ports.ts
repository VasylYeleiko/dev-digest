import type { DegradedReason, FileRankRow, IndexState, IndexStatus } from './types.js';

/**
 * repo-intel — persistence port + its row shapes (ring 1). `RepoIntelStore`
 * is implemented by RepoIntelRepository (Drizzle, ring 3); the facade service
 * and the indexer pipeline depend only on this interface.
 */

/** Row shape the indexer pipeline buffers up before persistence. */
export interface IndexerSymbolRow {
  repoId: string;
  path: string;
  name: string;
  kind: string;
  line: number;
  endLine: number | null;
  exported: boolean;
  signature: string | null;
  contentHash: string;
}

export interface IndexerReferenceRow {
  repoId: string;
  fromPath: string;
  toSymbol: string;
  line: number;
  contentHash: string;
}

/** Bundle of values the pipeline persists into `repo_index_state`. */
export interface IndexStateUpsert {
  repoId: string;
  lastIndexedSha: string;
  indexerVersion: number;
  status: IndexStatus;
  filesIndexed: number;
  filesSkipped: number;
  stats: Record<string, unknown>;
}

/** Minimal repo shape the facade needs to call CodeIndex on a clone. */
export interface RepoBasics {
  id: string;
  owner: string;
  name: string;
  defaultBranch: string;
  clonePath: string | null;
}

/** Cached row from the existing `symbols` table (blast persists these). */
export interface CachedSymbolRow {
  path: string;
  name: string;
  kind: string;
  line: number | null;
}

/** Cached row from the existing `references` table. */
export interface CachedReferenceRow {
  fromPath: string;
  toSymbol: string;
  line: number;
}

// --- T3 row shapes ----------------------------------------------------------

/** Import-graph edge (importer → imported), repo-relative paths. */
export interface IndexerEdgeRow {
  fromFile: string;
  toFile: string;
}

/** One `file_rank` row the rank step buffers before persistence. */
export interface IndexerFileRankRow {
  filePath: string;
  pagerank: number;
  hotness: number;
  rank: number;
  percentile: number;
}

/** Precomputed per-file facts (endpoints/crons) the indexer writes for blast. */
export interface IndexerFileFactsRow {
  filePath: string;
  endpoints: string[];
  crons: string[];
}

/** Candidate row for the repo-map renderer (symbols × file_rank). */
export interface RepoMapCandidateRow {
  path: string;
  name: string;
  exported: boolean;
  signature: string | null;
  rank: number;
}

/** Full symbol row (with the T2 columns) — for getSymbolsInFiles + blast. */
export interface FullSymbolRow {
  path: string;
  name: string;
  kind: string;
  line: number | null;
  endLine: number | null;
  exported: boolean;
  signature: string | null;
}

/** A resolved cross-file caller (reference whose decl_file is a changed file). */
export interface ResolvedCallerRow {
  fromPath: string;
  toSymbol: string;
  line: number;
  rank: number;
}

export interface RepoIntelStore {
  getRepoBasics(repoId: string): Promise<RepoBasics | null>;
  getCachedSymbols(repoId: string): Promise<CachedSymbolRow[]>;
  getCachedSymbolsForFiles(repoId: string, paths: string[]): Promise<CachedSymbolRow[]>;
  getCachedReferencesTo(repoId: string, toSymbols: string[]): Promise<CachedReferenceRow[]>;
  tryGetIndexState(repoId: string): Promise<IndexState | null>;
  deleteAllForRepo(repoId: string): Promise<void>;
  deleteForFiles(repoId: string, paths: string[]): Promise<void>;
  insertSymbols(rows: IndexerSymbolRow[]): Promise<void>;
  insertReferences(rows: IndexerReferenceRow[]): Promise<void>;
  upsertIndexState(state: IndexStateUpsert): Promise<void>;
  touchIndexState(repoId: string, stats?: Record<string, unknown>): Promise<void>;
  advanceSha(repoId: string, sha: string): Promise<void>;
  replaceEdges(repoId: string, edges: IndexerEdgeRow[]): Promise<void>;
  replaceFileRank(repoId: string, rows: IndexerFileRankRow[]): Promise<void>;
  replaceFileFacts(repoId: string, rows: IndexerFileFactsRow[]): Promise<void>;
  resolveReferences(repoId: string, opts: { reset: boolean }): Promise<void>;
  getEdges(repoId: string): Promise<IndexerEdgeRow[]>;
  getFileRankFor(repoId: string, paths: string[]): Promise<FileRankRow[]>;
  getRankedPaths(repoId: string, limit: number): Promise<Array<{ path: string; rank: number }>>;
  getRepoMapCandidates(repoId: string): Promise<RepoMapCandidateRow[]>;
  getSymbolRows(repoId: string, paths: string[]): Promise<FullSymbolRow[]>;
  getResolvedCallers(repoId: string, declFiles: string[], names: string[]): Promise<ResolvedCallerRow[]>;
  getFileFacts(repoId: string, files: string[]): Promise<IndexerFileFactsRow[]>;
  getRepoMapCache(repoId: string, commitSha: string, tokenBudget: number): Promise<{ mapText: string; tokenCount: number } | null>;
  putRepoMapCache(repoId: string, commitSha: string, tokenBudget: number, mapText: string, tokenCount: number): Promise<void>;
  deleteRepoMapCache(repoId: string): Promise<void>;
  patchFileFacts(repoId: string, files: string[], rows: IndexerFileFactsRow[]): Promise<void>;
}
