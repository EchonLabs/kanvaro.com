/**
 * PR #927 follow-up review: list and report routes put the search text
 * straight into $regex / new RegExp(), so "(" caused a 500 and a crafted
 * pattern could make the database do expensive work. They now escape it with
 * lib/text/escape-regex.
 *
 * Guard: no API route may build a regex from the raw `search` query value.
 */
import fs from 'fs'
import path from 'path'

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : routeFiles(full)
    return entry.name === 'route.ts' ? [full] : []
  })
}

// `search` itself (or search.trim()), but not `searchPattern` / `searchRegex`.
const RAW_SEARCH_IN_REGEX = /\$regex:\s*search\b|new RegExp\(\s*search\b/

describe('search text is escaped before it becomes a regex', () => {
  const apiDir = path.join(process.cwd(), 'src', 'app', 'api')

  it('no API route uses the raw `search` value in $regex or new RegExp()', () => {
    const offenders = routeFiles(apiDir).flatMap((file) => {
      const source = fs.readFileSync(file, 'utf8')
      // Routes that escape the value where they read it (members) are fine.
      if (/const search = escapeRegex\(/.test(source)) return []
      return source
        .split(/\r?\n/)
        .map((line, i) => ({ line: line.trim(), at: `${path.relative(apiDir, file)}:${i + 1}` }))
        .filter(({ line }) => !line.startsWith('//') && RAW_SEARCH_IN_REGEX.test(line))
        .map(({ at, line }) => `${at}  ${line}`)
    })
    expect(offenders).toEqual([])
  })

  it('the routes from the review import the shared helper', () => {
    for (const route of [
      'projects', 'stories', 'epics', 'sprints', 'backlog', 'activity',
      'reports/projects', 'reports/team', 'templates/projects', 'templates/tasks',
      'time-tracking/hr/employees'
    ]) {
      const source = fs.readFileSync(path.join(apiDir, route, 'route.ts'), 'utf8')
      expect([route, source.includes("from '@/lib/text/escape-regex'")]).toEqual([route, true])
    }
  })
})
