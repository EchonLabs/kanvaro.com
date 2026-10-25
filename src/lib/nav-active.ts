/**
 * Some nav items (e.g. `/my/standup`) point at a server redirector rather
 * than a landable URL, so the browser's actual pathname is a nested route
 * (`/my/standup/[standupId]`) that never strictly equals `child.path`.
 * A prefix match keeps those items highlighted/expanded without affecting
 * siblings whose paths are exact, landable routes.
 *
 * The stand-up hub and run/summary screens live under `/projects/[id]/...`
 * for permission scoping, so a plain prefix match lit up "All Projects" while
 * the user was clearly in the Stand-up module. They belong to "My Stand-up".
 */
const PROJECT_SCOPED_STANDUP_ROUTE = /^\/projects\/[^/]+\/(standups|sprints\/[^/]+\/standups)(\/|$)/

const MY_STANDUP_PATH = '/my/standup'

/**
 * Stand-up Analytics: the sprint picker and every sprint's report. The report
 * is nested under `/sprints/[id]`, so a plain prefix match would light the
 * "Sprints" item as well as "Analytics"; they belong to "Analytics" alone.
 */
const SPRINT_ANALYTICS_ROUTE = /^\/sprints\/(analytics|[^/]+\/analytics)(\/|$)/

const SPRINT_ANALYTICS_PATH = '/sprints/analytics'

export function isNavPathActive(pathname: string, itemPath: string): boolean {
  if (PROJECT_SCOPED_STANDUP_ROUTE.test(pathname)) return itemPath === MY_STANDUP_PATH
  if (SPRINT_ANALYTICS_ROUTE.test(pathname)) return itemPath === SPRINT_ANALYTICS_PATH
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`)
}
