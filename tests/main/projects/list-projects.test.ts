import { describe, expect, it } from 'vitest'
import { listActiveProjects } from '../../../src/main/projects/listProjects'
import { createTestDb } from '../testDb'

describe('listActiveProjects', () => {
  it('returns active projects with basename labels and full local paths', () => {
    const db = createTestDb()

    db.exec(`
      insert into projects (
        id,
        name,
        local_path,
        source_platforms_json,
        discovered_at,
        user_pinned,
        is_active
      )
      values
      (
        '/workspace/dialoglingo',
        'dialoglingo',
        '/workspace/dialoglingo',
        '["codex"]',
        '2026-06-16T00:00:00Z',
        0,
        1
      ),
      (
        '/workspace/inactive',
        'inactive',
        '/workspace/inactive',
        '["claude"]',
        '2026-06-16T00:00:00Z',
        0,
        0
      );
    `)

    expect(listActiveProjects(db)).toEqual([
      {
        id: '/workspace/dialoglingo',
        name: 'dialoglingo',
        localPath: '/workspace/dialoglingo',
        sourcePlatforms: ['codex']
      }
    ])
  })

  it('can hide projects that only contain archived sessions', () => {
    const db = createTestDb()

    db.exec(`
      insert into projects (
        id,
        name,
        local_path,
        source_platforms_json,
        discovered_at,
        user_pinned,
        is_active
      )
      values
      (
        '/workspace/active',
        'active',
        '/workspace/active',
        '["codex"]',
        '2026-06-16T00:00:00Z',
        0,
        1
      ),
      (
        '/workspace/archived',
        'archived',
        '/workspace/archived',
        '["claude"]',
        '2026-06-16T00:00:00Z',
        0,
        1
      );

      insert into sessions (
        id,
        source_type,
        source_session_id,
        project_id,
        title,
        started_at,
        updated_at,
        preview,
        search_text,
        is_archived,
        raw_locator,
        hash
      )
      values
      (
        's1',
        'codex',
        's1',
        '/workspace/active',
        'Active session',
        '2026-06-16T00:00:00Z',
        '2026-06-16T00:10:00Z',
        'preview',
        'body',
        0,
        'fixture',
        'h1'
      ),
      (
        's2',
        'claude',
        's2',
        '/workspace/archived',
        'Archived session',
        '2026-06-16T00:00:00Z',
        '2026-06-16T00:10:00Z',
        'preview',
        'body',
        1,
        'fixture',
        'h2'
      );
    `)

    expect(
      listActiveProjects(db, { includeArchived: false }).map((project) => project.id)
    ).toEqual(['/workspace/active'])
    expect(
      listActiveProjects(db, { includeArchived: true }).map((project) => project.id)
    ).toEqual(['/workspace/active', '/workspace/archived'])
  })
})
