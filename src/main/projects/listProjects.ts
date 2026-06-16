import type Database from 'better-sqlite3'

export type ProjectListRow = {
  id: string
  name: string
  localPath: string
  sourcePlatforms: string[]
}

export function listActiveProjects(db: Database.Database): ProjectListRow[] {
  return (
    db
      .prepare(
        `
          select
            id,
            name,
            local_path as localPath,
            source_platforms_json as sourcePlatformsJson
          from projects
          where is_active = 1
          order by lower(name) asc, lower(local_path) asc
        `
      )
      .all() as Array<{
      id: string
      name: string
      localPath: string
      sourcePlatformsJson: string
    }>
  ).map((project) => ({
    id: project.id,
    name: project.name,
    localPath: project.localPath,
    sourcePlatforms: JSON.parse(project.sourcePlatformsJson) as string[]
  }))
}
