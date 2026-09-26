import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { eq, and } from 'drizzle-orm';
import {
  GENERAL_REVIEWER_PROMPT,
  SECURITY_REVIEWER_PROMPT,
  PERFORMANCE_REVIEWER_PROMPT,
  TEST_QUALITY_REVIEWER_PROMPT,
} from './seed-prompts.js';

/** Default provider/model for the built-in reviewer agents. */
const DEFAULT_PROVIDER = 'openrouter' as const;
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

/**
 * Seed the starter's demo data. Idempotent: re-running upserts the default
 * workspace/user and the demo fixtures.
 *
 * Seeds: default workspace + system user + membership, default settings,
 * demo repo (acme/payments-api), PR #482 with files/commits, a sample review
 * with a few findings, and the three built-in agents (General + Security +
 * Performance), all on the default openrouter/deepseek-v4-flash provider+model.
 *
 * Course lessons populate the other tables (skills, conventions, memory, eval,
 * …) once their features are built — they start empty here.
 */

export const DEFAULT_WORKSPACE_NAME = 'default';
export const SYSTEM_USER_EMAIL = 'you@local';

export async function seed(db: Db): Promise<{ workspaceId: string; userId: string }> {
  // ---- workspace + user (no-auth defaults) ----
  let [ws] = await db
    .select()
    .from(t.workspaces)
    .where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
  if (!ws) {
    [ws] = await db
      .insert(t.workspaces)
      .values({ name: DEFAULT_WORKSPACE_NAME })
      .returning();
  }
  const workspaceId = ws!.id;

  let [user] = await db.select().from(t.users).where(eq(t.users.email, SYSTEM_USER_EMAIL));
  if (!user) {
    [user] = await db
      .insert(t.users)
      .values({ email: SYSTEM_USER_EMAIL, name: 'You' })
      .returning();
  }
  const userId = user!.id;

  await db
    .insert(t.workspaceMembers)
    .values({ workspaceId, userId, role: 'owner' })
    .onConflictDoNothing();

  // ---- default settings ----
  const defaultSettings: Record<string, unknown> = {
    polling_interval_min: 5,
    theme: 'dark',
    density: 'regular',
    sync_to_folder: true,
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    await db
      .insert(t.settings)
      .values({ workspaceId, userId, key, value })
      .onConflictDoNothing();
  }

  // ---- demo repo (acme/payments-api) ----
  let [repo] = await db
    .select()
    .from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
  if (!repo) {
    [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'payments-api',
        fullName: 'acme/payments-api',
        defaultBranch: 'main',
        clonePath: null,
        createdBy: userId,
      })
      .returning();
  }
  const repoId = repo!.id;

  // ---- PR #482 (rate limiting) ----
  let [pr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 482)));
  if (!pr) {
    [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 482,
        title: 'Add rate limiting to public API endpoints',
        author: 'marisa.koch',
        branch: 'feat/rate-limit-public',
        base: 'main',
        headSha: 'a1b2c3d4e5f6',
        additions: 247,
        deletions: 38,
        filesCount: 9,
        status: 'needs_review',
        body: 'Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.',
      })
      .returning();

    // pr_files (subset)
    await db.insert(t.prFiles).values([
      { prId: pr!.id, path: 'src/middleware/ratelimit.ts', additions: 84, deletions: 0 },
      { prId: pr!.id, path: 'src/api/public/webhooks.ts', additions: 31, deletions: 6 },
      { prId: pr!.id, path: 'src/config.ts', additions: 4, deletions: 0 },
      { prId: pr!.id, path: 'src/api/users.ts', additions: 7, deletions: 2 },
    ]);

    // pr_commits
    await db.insert(t.prCommits).values({
      prId: pr!.id,
      sha: 'a1b2c3d4e5f6',
      message: 'Add token-bucket rate limiter',
      author: 'marisa.koch',
    });

    // a sample review + findings so the PR shows results before the first run
    const [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        kind: 'review',
        verdict: 'request_changes',
        summary:
          'Solid middleware approach, but a Stripe secret key is committed in plaintext and the user-list endpoint introduces an N+1 query under the new limiter.',
        score: 61,
        model: 'seed',
      })
      .returning();

    await db.insert(t.findings).values([
      {
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 12,
        endLine: 12,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key in commit',
        rationale: 'Line 12 contains a literal `sk_live_` Stripe secret key.',
        suggestion: 'Move to env var and rotate the key immediately.',
        confidence: 0.98,
      },
      {
        reviewId: review!.id,
        file: 'src/api/users.ts',
        startLine: 45,
        endLine: 52,
        severity: 'WARNING',
        category: 'perf',
        title: 'N+1 query in user list endpoint',
        rationale: 'Loop issues one query per user → N+1.',
        suggestion: 'Use a single IN query and group in memory.',
        confidence: 0.86,
      },
    ]);
  }

  // ---- skills (reusable Markdown prompt blocks) ----
  // 3 of the 4 demo skills — `flake-guard` is deliberately left OUT of seed; it
  // is imported by hand through the UI as a manual demo step. Inserted directly
  // (not through the service), same style as the agents below.
  const seedSkills: Array<typeof t.skills.$inferInsert> = [
    {
      workspaceId,
      name: 'branch-coverage-rubric',
      description: 'Flags production branches this diff\'s tests never exercise.',
      type: 'rubric',
      source: 'manual',
      body: `# Branch coverage rubric

Flag production logic whose branches this diff's tests don't exercise.

- Every \`if\`/\`else\`, \`switch\` case, and ternary added or changed by the diff needs
  at least one test that drives execution down EACH side — not just the happy path.
- Error and rejection paths (\`catch\`, a thrown \`AppError\`, a \`.catch()\`) count as a
  branch too: a handler with no test for its failure path is an uncovered branch.
- \`??\` / \`||\` fallbacks and early returns are branches — test the case where the
  fallback fires, not only the case where it doesn't.
- A loop needs both a zero-iteration and a multi-iteration case whenever the diff
  changes what happens inside it.`,
      enabled: true,
      version: 1,
    },
    {
      workspaceId,
      name: 'corner-case-checklist',
      description: 'A checklist of edge-case inputs a diff\'s tests should try.',
      type: 'convention',
      source: 'manual',
      body: `# Corner-case checklist

Before approving, confirm the diff's tests try these inputs where relevant:

- Empty: \`''\`, \`[]\`, \`{}\`, \`0\`, an empty result set / empty page.
- Boundary: the first item, the last item, exactly at a limit/threshold (off-by-one).
- Null vs. undefined: an optional field left out entirely vs. explicitly \`null\`.
- Concurrency: two operations racing on the same key/row, a cancel mid-flight.
- Changed contracts: a new field, a changed status code, a changed nullability —
  pin the new shape with an assertion, don't just eyeball it.`,
      enabled: true,
      version: 1,
    },
    {
      workspaceId,
      name: 'mock-discipline',
      description: 'Rules for when a mock hides a regression instead of catching one.',
      type: 'convention',
      source: 'manual',
      body: `# Mock discipline

- Never mock the exact function or module the test claims to verify — that
  guarantees the test can't fail even when the logic breaks.
- A mock's return value should model realistic behavior, not the exact object the
  assertion checks for — hand-tuning a mock to match the assertion tests nothing.
- Tests named or shaped like an integration test (crossing modules, hitting the DB)
  should use the project's real fixtures/testcontainers, not a mocked DB/container.
- When the real dependency a mock stands in for changes shape, update the mock in
  the same diff — a stale mock is a false green.`,
      enabled: true,
      version: 1,
    },
  ];
  for (const s of seedSkills) {
    const [existing] = await db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, s.name)));
    if (!existing) {
      const [row] = await db.insert(t.skills).values(s).returning();
      await db
        .insert(t.skillVersions)
        .values({ skillId: row!.id, version: 1, body: row!.body })
        .onConflictDoNothing();
    }
  }

  // ---- built-in agents (the four starter presets) ----
  // Prompt bodies live in ./seed-prompts.ts (mirrored in docs/agent-prompts/*.md).
  const seedAgents: Array<typeof t.agents.$inferInsert> = [
    {
      workspaceId,
      name: 'General Reviewer',
      description: 'Reviews a PR diff for bugs, correctness, and clarity.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: GENERAL_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Security Reviewer',
      description: 'Flags secrets, injection, SSRF and the lethal trifecta before merge.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: SECURITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Performance Reviewer',
      description: 'Catches N+1 queries, missing indexes, and hot-path allocations.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: PERFORMANCE_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Test Quality Reviewer',
      description: 'Flags uncovered branches, missed corner cases, over-mocking, and flaky tests.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: TEST_QUALITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
  ];
  for (const a of seedAgents) {
    const [existing] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, a.name)));
    if (!existing) await db.insert(t.agents).values(a);
  }

  // ---- link the demo skills to Test Quality Reviewer (order 0..2) ----
  // `flake-guard` is intentionally NOT linked here — it isn't seeded (imported
  // by hand in the demo). Guarded per-link via onConflictDoNothing on the
  // (agentId, skillId) PK, so re-seeding never duplicates or reorders a link.
  const [testQualityReviewer] = await db
    .select()
    .from(t.agents)
    .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'Test Quality Reviewer')));
  if (testQualityReviewer) {
    const linkedSkillNames = ['branch-coverage-rubric', 'corner-case-checklist', 'mock-discipline'];
    for (let i = 0; i < linkedSkillNames.length; i++) {
      const [skill] = await db
        .select()
        .from(t.skills)
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, linkedSkillNames[i]!)));
      if (skill) {
        await db
          .insert(t.agentSkills)
          .values({ agentId: testQualityReviewer.id, skillId: skill.id, order: i })
          .onConflictDoNothing();
      }
    }
  }

  // ---- a demo agent run, backing the seeded review's PR timeline row ----
  // The review above is inserted with no run_id (agent_runs didn't exist yet
  // in its scope), so the PR detail page's TIMELINE has nothing to render but
  // the commit. Link a run after the agents exist (this run needs an
  // agentId), guarded on the review not already having one so re-seeding
  // stays idempotent.
  if (pr) {
    const [seededReview] = await db
      .select()
      .from(t.reviews)
      .where(and(eq(t.reviews.prId, pr.id), eq(t.reviews.kind, 'review')));
    if (seededReview && !seededReview.runId) {
      const [generalReviewer] = await db
        .select()
        .from(t.agents)
        .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'General Reviewer')));
      const [run] = await db
        .insert(t.agentRuns)
        .values({
          workspaceId,
          agentId: generalReviewer?.id ?? null,
          prId: pr.id,
          provider: DEFAULT_PROVIDER,
          model: DEFAULT_MODEL,
          durationMs: 8400,
          tokensIn: 6200,
          tokensOut: 980,
          costUsd: 0.0021,
          status: 'done',
          source: 'local',
          findingsCount: 2,
          grounding: '2/2 passed',
          score: seededReview.score,
          blockers: 1,
        })
        .returning();
      await db.update(t.reviews).set({ runId: run!.id }).where(eq(t.reviews.id, seededReview.id));
    }
  }

  return { workspaceId, userId };
}

// CLI entrypoint
// argv[1] is absent when imported as a module (e.g. by tests) — not a CLI run.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const handle = createDb(url);
  seed(handle.db)
    .then(async (r) => {
      console.log('✓ seeded', r);
      await handle.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('✗ seed failed:', err);
      await handle.close();
      process.exit(1);
    });
}
