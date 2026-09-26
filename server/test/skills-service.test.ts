import { describe, it, expect, vi } from 'vitest';
import { SkillsService } from '../src/modules/skills/service.js';
import type { SkillStore } from '../src/modules/skills/ports.js';
import type { SkillEntity, SkillStatsEntity, SkillVersionEntity } from '../src/modules/skills/types.js';

/**
 * Hermetic unit coverage for SkillsService — a mocked SkillStore, no Postgres.
 * Mirrors `test/repo-intel-facade-degraded.test.ts`'s mocked-port style.
 */

const entity: SkillEntity = {
  id: 's1',
  workspaceId: 'w1',
  name: 'branch-coverage-rubric',
  description: 'Flags uncovered branches.',
  type: 'rubric',
  source: 'manual',
  body: 'v1 body',
  enabled: true,
  version: 1,
  evidenceFiles: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

function buildStore(overrides: Partial<SkillStore> = {}): SkillStore {
  return {
    list: vi.fn(async () => [entity]),
    getById: vi.fn(async (_ws: string, id: string) => (id === entity.id ? entity : undefined)),
    deleteById: vi.fn(async () => true),
    insert: vi.fn(async () => entity),
    update: vi.fn(async () => entity),
    listVersions: vi.fn(async () => []),
    getVersion: vi.fn(async () => undefined),
    resolveForAgent: vi.fn(async () => []),
    statsForSkill: vi.fn(
      async (): Promise<SkillStatsEntity> => ({
        usedBy: 0,
        agents: [],
        acceptRate: null,
        findings30d: null,
        findingsByCategory: [],
      }),
    ),
    ...overrides,
  };
}

describe('SkillsService.list / get', () => {
  it('list maps every row to the wire DTO', async () => {
    const svc = new SkillsService({ skills: buildStore() });
    const rows = await svc.list('w1');
    expect(rows).toEqual([
      {
        id: 's1',
        name: 'branch-coverage-rubric',
        description: 'Flags uncovered branches.',
        type: 'rubric',
        source: 'manual',
        body: 'v1 body',
        enabled: true,
        version: 1,
        evidence_files: null,
      },
    ]);
  });

  it('get returns undefined for an unknown id (→ 404 at the route)', async () => {
    const svc = new SkillsService({ skills: buildStore() });
    expect(await svc.get('w1', 'ghost')).toBeUndefined();
  });
});

describe('SkillsService.create / update / delete', () => {
  it('create passes source/enabled through only when provided', async () => {
    const insert = vi.fn(async () => entity);
    const svc = new SkillsService({ skills: buildStore({ insert }) });
    await svc.create('w1', {
      name: 'x',
      description: 'y',
      type: 'convention',
      body: 'z',
    });
    expect(insert).toHaveBeenCalledWith({
      workspaceId: 'w1',
      name: 'x',
      description: 'y',
      type: 'convention',
      body: 'z',
    });
  });

  it('update forwards only the patched fields', async () => {
    const update = vi.fn(async () => entity);
    const svc = new SkillsService({ skills: buildStore({ update }) });
    await svc.update('w1', 's1', { body: 'new body' });
    expect(update).toHaveBeenCalledWith('w1', 's1', { body: 'new body' });
  });

  it('delete returns what the store reports', async () => {
    const svc = new SkillsService({ skills: buildStore({ deleteById: vi.fn(async () => false) }) });
    expect(await svc.delete('w1', 'ghost')).toBe(false);
  });
});

describe('SkillsService.listVersions / getVersion — workspace scoping', () => {
  it('listVersions returns undefined when the skill is not in this workspace', async () => {
    const svc = new SkillsService({ skills: buildStore({ getById: vi.fn(async () => undefined) }) });
    expect(await svc.listVersions('other-ws', 's1')).toBeUndefined();
  });

  it('listVersions maps rows when the skill IS in this workspace', async () => {
    const versionRow: SkillVersionEntity = {
      skillId: 's1',
      version: 1,
      body: 'v1 body',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const svc = new SkillsService({
      skills: buildStore({ listVersions: vi.fn(async () => [versionRow]) }),
    });
    expect(await svc.listVersions('w1', 's1')).toEqual([
      { skill_id: 's1', version: 1, body: 'v1 body', created_at: '2026-01-01T00:00:00.000Z' },
    ]);
  });

  it('getVersion returns undefined when the version was never recorded', async () => {
    const svc = new SkillsService({ skills: buildStore() });
    expect(await svc.getVersion('w1', 's1', 99)).toBeUndefined();
  });
});

describe('SkillsService.stats', () => {
  it('returns undefined (→ 404) when the skill is not in this workspace', async () => {
    const svc = new SkillsService({ skills: buildStore({ getById: vi.fn(async () => undefined) }) });
    expect(await svc.stats('other-ws', 's1')).toBeUndefined();
  });

  it('maps the aggregated entity to the wire DTO when the skill exists', async () => {
    const svc = new SkillsService({
      skills: buildStore({
        statsForSkill: vi.fn(async () => ({
          usedBy: 1,
          agents: [{ id: 'a1', name: 'Test Quality Reviewer' }],
          acceptRate: 1,
          findings30d: 2,
          findingsByCategory: [{ category: 'testing', count: 2 }],
        })),
      }),
    });
    expect(await svc.stats('w1', 's1')).toEqual({
      used_by: 1,
      agents: [{ id: 'a1', name: 'Test Quality Reviewer' }],
      accept_rate: 1,
      findings_30d: 2,
      findings_by_category: [{ category: 'testing', count: 2 }],
    });
  });
});

describe('SkillsService.importPreview', () => {
  it('decodes base64, parses the file, and persists nothing', async () => {
    const insert = vi.fn();
    const svc = new SkillsService({ skills: buildStore({ insert }) });
    const text = '---\nname: Flake Guard\ndescription: Flags flaky patterns\ntype: convention\n---\n# Flake Guard\nrules';
    const preview = svc.importPreview('flake-guard.md', Buffer.from(text, 'utf-8').toString('base64'));
    expect(preview).toEqual({
      name: 'Flake Guard',
      description: 'Flags flaky patterns',
      type: 'convention',
      body: '# Flake Guard\nrules',
      source: 'extracted',
    });
    expect(insert).not.toHaveBeenCalled();
  });
});
