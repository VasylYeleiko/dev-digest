import { describe, it, expect } from 'vitest';
import { zipSync } from 'fflate';
import {
  isBodyChange,
  parseSkillFile,
  toSkillDto,
  toSkillStatsDto,
  toSkillVersionDto,
} from '../src/modules/skills/helpers.js';
import { MAX_IMPORT_BYTES } from '../src/modules/skills/constants.js';
import type { SkillEntity, SkillStatsEntity, SkillVersionEntity } from '../src/modules/skills/types.js';

/**
 * Hermetic unit coverage for the skills module's pure helpers: DTO mapping,
 * the body-version-bump rule, and the `.md`/`.zip` import parser (in-memory
 * unzip only — no filesystem, no child process).
 */

const baseEntity: SkillEntity = {
  id: 's1',
  workspaceId: 'w1',
  name: 'branch-coverage-rubric',
  description: 'Flags uncovered branches.',
  type: 'rubric',
  source: 'manual',
  body: '# Rubric\n- flag uncovered branches',
  enabled: true,
  version: 1,
  evidenceFiles: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('toSkillDto', () => {
  it('maps camelCase entity fields to the snake_case wire DTO', () => {
    expect(toSkillDto(baseEntity)).toEqual({
      id: 's1',
      name: 'branch-coverage-rubric',
      description: 'Flags uncovered branches.',
      type: 'rubric',
      source: 'manual',
      body: '# Rubric\n- flag uncovered branches',
      enabled: true,
      version: 1,
      evidence_files: null,
    });
  });

  it('passes through evidence_files when present', () => {
    expect(toSkillDto({ ...baseEntity, evidenceFiles: ['a.md'] }).evidence_files).toEqual(['a.md']);
  });
});

describe('toSkillVersionDto', () => {
  it('maps a skill_versions row to the wire DTO', () => {
    const row: SkillVersionEntity = {
      skillId: 's1',
      version: 2,
      body: 'v2 body',
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
    };
    expect(toSkillVersionDto(row)).toEqual({
      skill_id: 's1',
      version: 2,
      body: 'v2 body',
      created_at: '2026-02-01T00:00:00.000Z',
    });
  });
});

describe('toSkillStatsDto', () => {
  it('maps an aggregated stats entity to the wire DTO, preserving null approximations', () => {
    const stats: SkillStatsEntity = {
      usedBy: 0,
      agents: [],
      acceptRate: null,
      findings30d: null,
      findingsByCategory: [],
    };
    expect(toSkillStatsDto(stats)).toEqual({
      used_by: 0,
      agents: [],
      accept_rate: null,
      findings_30d: null,
      findings_by_category: [],
    });
  });

  it('maps non-empty aggregates straight through', () => {
    const stats: SkillStatsEntity = {
      usedBy: 2,
      agents: [{ id: 'a1', name: 'Test Quality Reviewer' }],
      acceptRate: 0.5,
      findings30d: 4,
      findingsByCategory: [{ category: 'testing', count: 4 }],
    };
    expect(toSkillStatsDto(stats)).toEqual({
      used_by: 2,
      agents: [{ id: 'a1', name: 'Test Quality Reviewer' }],
      accept_rate: 0.5,
      findings_30d: 4,
      findings_by_category: [{ category: 'testing', count: 4 }],
    });
  });
});

describe('isBodyChange', () => {
  it('false when the patch omits body', () => {
    expect(isBodyChange({ body: 'a' }, {})).toBe(false);
  });

  it('false when the patch body is identical', () => {
    expect(isBodyChange({ body: 'a' }, { body: 'a' })).toBe(false);
  });

  it('true when the patch body differs', () => {
    expect(isBodyChange({ body: 'a' }, { body: 'b' })).toBe(true);
  });
});

describe('parseSkillFile — markdown', () => {
  it('parses frontmatter name/description/type + body', () => {
    const text = '---\nname: My Skill\ndescription: Does a thing\ntype: convention\n---\n# My Skill\nbody text';
    const parsed = parseSkillFile('my-skill.md', new TextEncoder().encode(text));
    expect(parsed).toEqual({
      name: 'My Skill',
      description: 'Does a thing',
      type: 'convention',
      body: '# My Skill\nbody text',
    });
  });

  it('derives name from the first heading and defaults description/type when frontmatter is absent', () => {
    const text = '# Corner Case Checklist\n\nSome rules here.';
    const parsed = parseSkillFile('corner-case-checklist.md', new TextEncoder().encode(text));
    expect(parsed.name).toBe('Corner Case Checklist');
    expect(parsed.type).toBe('custom');
    expect(parsed.description.length).toBeGreaterThan(0);
    expect(parsed.body).toContain('Some rules here.');
  });

  it('falls back to an unknown frontmatter type → custom', () => {
    const text = '---\nname: X\ntype: not-a-real-type\n---\nbody';
    const parsed = parseSkillFile('x.md', new TextEncoder().encode(text));
    expect(parsed.type).toBe('custom');
  });

  it('falls back to the filename when there is no frontmatter name and no heading', () => {
    const text = 'just some body text, no heading';
    const parsed = parseSkillFile('mock-discipline.md', new TextEncoder().encode(text));
    expect(parsed.name.toLowerCase()).toContain('mock discipline');
  });

  it('.markdown extension is accepted the same as .md', () => {
    const parsed = parseSkillFile('x.markdown', new TextEncoder().encode('# X\nbody'));
    expect(parsed.name).toBe('X');
  });
});

describe('parseSkillFile — zip', () => {
  it('reads SKILL.md from an in-memory zip and ignores every other entry', () => {
    const zip = zipSync({
      'SKILL.md': new TextEncoder().encode('---\nname: Flake Guard\n---\n# Flake Guard\nrules'),
      'scripts/run.sh': new TextEncoder().encode('#!/bin/sh\necho pwned'),
      'notes.txt': new TextEncoder().encode('irrelevant'),
    });
    const parsed = parseSkillFile('flake-guard.zip', zip);
    expect(parsed.name).toBe('Flake Guard');
    expect(parsed.body).toContain('rules');
    expect(parsed.body).not.toContain('pwned');
  });

  it('falls back to the first *.md entry when there is no SKILL.md', () => {
    const zip = zipSync({
      'README.md': new TextEncoder().encode('# Fallback Skill\nbody here'),
      'asset.bin': new Uint8Array([1, 2, 3]),
    });
    const parsed = parseSkillFile('bundle.zip', zip);
    expect(parsed.name).toBe('Fallback Skill');
  });

  it('throws when the zip has no markdown entry at all', () => {
    const zip = zipSync({ 'asset.bin': new Uint8Array([1, 2, 3]) });
    expect(() => parseSkillFile('empty.zip', zip)).toThrow();
  });
});

describe('parseSkillFile — rejection cases', () => {
  it('throws on an unsupported file extension', () => {
    expect(() => parseSkillFile('skill.txt', new TextEncoder().encode('hi'))).toThrow();
  });

  it('throws when the file exceeds the size cap', () => {
    const oversized = new Uint8Array(MAX_IMPORT_BYTES + 1);
    expect(() => parseSkillFile('big.md', oversized)).toThrow();
  });
});
