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
})
