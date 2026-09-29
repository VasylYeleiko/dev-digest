import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  doublePrecision,
  integer,
  vector,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';

// ============================================================ Knowledge / RAG

export const memory = pgTable(
  'memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scope: text('scope', { enum: ['repo', 'global', 'team'] }).notNull(),
    kind: text('kind', {
      enum: ['decision', 'convention', 'preference', 'fact', 'learning'],
    }).notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    confidence: doublePrecision('confidence'),
    sources: jsonb('sources'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({ wsIdx: index('memory_ws_idx').on(t.workspaceId) }),
);

/**
 * Extracted house-rules (Skills Lab → Conventions). Evidence columns stay
 * nullable: the extractor always fills them, but a plugin-imported convention
 * (`PluginConvention`) may carry none. `category` is validated by the
 * `ConventionCategory` contract, not a CHECK — the set is expected to grow;
 * `status` drives re-scan semantics, so the DB enforces it.
 */
export const conventions = pgTable(
  'conventions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    category: text('category').notNull().default('other'),
    rule: text('rule').notNull(),
    evidencePath: text('evidence_path'),
    evidenceLineStart: integer('evidence_line_start'),
    evidenceLineEnd: integer('evidence_line_end'),
    evidenceSnippet: text('evidence_snippet'),
    confidence: doublePrecision('confidence'),
    status: text('status', { enum: ['pending', 'accepted', 'rejected'] })
      .notNull()
      .default('pending'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    statusCheck: check('conventions_status_check', sql`${t.status} IN ('pending', 'accepted', 'rejected')`),
    confidenceCheck: check(
      'conventions_confidence_check',
      sql`${t.confidence} IS NULL OR (${t.confidence} >= 0 AND ${t.confidence} <= 1)`,
    ),
    repoStatusIdx: index('conventions_repo_status_idx').on(t.repoId, t.status),
    wsIdx: index('conventions_ws_idx').on(t.workspaceId),
  }),
);

/** One extraction run per row — the Conventions page header + evidence-gate stats. */
export const conventionScans = pgTable(
  'convention_scans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    sampleFiles: jsonb('sample_files').$type<string[]>().notNull(),
    proposed: integer('proposed').notNull(),
    dropped: integer('dropped').notNull(),
    skipped: integer('skipped').notNull(),
    costUsd: doublePrecision('cost_usd'),
    createdAt: now(),
  },
  (t) => ({
    repoCreatedIdx: index('convention_scans_repo_created_idx').on(t.repoId, t.createdAt),
    wsIdx: index('convention_scans_ws_idx').on(t.workspaceId),
  }),
);
