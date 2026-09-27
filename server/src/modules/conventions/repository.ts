import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { ConventionCategory } from '@devdigest/shared';
import { advisoryXactLock, type Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { SCAN_LOCK_PREFIX } from './constants.js';
import type {
  ConventionPatch,
  ConventionStore,
  NewConvention,
  NewConventionScan,
} from './ports.js';
import type { ConventionEntity, ConventionScanEntity } from './types.js';

type ConventionRow = typeof t.conventions.$inferSelect;

/**
 * conventions data-access (ring 3); implements `ConventionStore`. Owns
 * `conventions` and `convention_scans`. Workspace-scoped throughout.
 */
export class ConventionsRepository implements ConventionStore {
  constructor(private db: Db) {}

  async listVisible(workspaceId: string, repoId: string): Promise<ConventionEntity[]> {
    const rows = await this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          inArray(t.conventions.status, ['pending', 'accepted']),
        ),
      )
      .orderBy(sql`${t.conventions.confidence} desc nulls last`, asc(t.conventions.createdAt));
    return rows.map(toEntity);
  }

  async triagedRules(workspaceId: string, repoId: string): Promise<string[]> {
    const rows = await this.db
      .select({ rule: t.conventions.rule })
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          inArray(t.conventions.status, ['accepted', 'rejected']),
        ),
      );
    return rows.map((r) => r.rule);
  }

  async latestScan(workspaceId: string, repoId: string): Promise<ConventionScanEntity | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(
        and(eq(t.conventionScans.workspaceId, workspaceId), eq(t.conventionScans.repoId, repoId)),
      )
      .orderBy(desc(t.conventionScans.createdAt))
      .limit(1);
    return row;
  }

  async replacePending(
    workspaceId: string,
    repoId: string,
    rows: NewConvention[],
    scan: NewConventionScan,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      // No unique key to upsert on — serialize concurrent re-scans of one repo
      // so two delete-then-insert passes can't interleave into duplicates.
      await advisoryXactLock(tx, `${SCAN_LOCK_PREFIX}${repoId}`);
      await tx
        .delete(t.conventions)
        .where(
          and(
            eq(t.conventions.workspaceId, workspaceId),
            eq(t.conventions.repoId, repoId),
            eq(t.conventions.status, 'pending'),
          ),
        );
      if (rows.length > 0) {
        await tx
          .insert(t.conventions)
          .values(rows.map((r) => ({ ...r, workspaceId, repoId, status: 'pending' as const })));
      }
      await tx.insert(t.conventionScans).values({ ...scan, workspaceId, repoId });
    });
  }

  async update(
    workspaceId: string,
    id: string,
    patch: ConventionPatch,
  ): Promise<ConventionEntity | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row ? toEntity(row) : undefined;
  }

  async acceptedByIds(workspaceId: string, repoId: string, ids: string[]): Promise<ConventionEntity[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.status, 'accepted'),
          inArray(t.conventions.id, ids),
        ),
      )
      .orderBy(sql`${t.conventions.confidence} desc nulls last`, asc(t.conventions.createdAt));
    return rows.map(toEntity);
  }
}

/** `category` is plain text in the DB (the set grows) — coerce unknowns to 'other'. */
function toEntity(row: ConventionRow): ConventionEntity {
  const category = ConventionCategory.safeParse(row.category);
  return { ...row, category: category.success ? category.data : 'other' };
}
